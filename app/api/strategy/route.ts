import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import {
  classifyGeminiApiError,
  detectPiiOrDisallowedKeys,
  GEMINI_FREE_TIER_MODEL,
  validateAndNormalizeStrategyResponse,
} from '../../../src/features/strategy/strategyService';
import { StrategyFocusMode } from '../../../src/types/gapfill';

const MAX_REQUESTS_PER_WINDOW = 15;
const WINDOW_MS = 60_000;
const requestLog: number[] = [];

function checkRateLimit(): { allowed: boolean; remaining: number } {
  const now = Date.now();
  while (requestLog.length > 0 && requestLog[0] < now - WINDOW_MS) {
    requestLog.shift();
  }
  if (requestLog.length >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0 };
  }
  requestLog.push(now);
  return {
    allowed: true,
    remaining: Math.max(0, MAX_REQUESTS_PER_WINDOW - requestLog.length),
  };
}

function buildFocusDirective(focus: StrategyFocusMode): string {
  if (focus === 'guest_extension') {
    return 'Primary goal: prioritize pitching a zero-cleaning-fee check-out extension or early arrival to adjacent reservation holders.';
  }
  if (focus === 'direct_promo') {
    return 'Primary goal: prioritize social media / past-guest direct booking outreach and channel urgency copy.';
  }
  return 'Primary goal: balanced conversion combining adjacent-guest outreach first and channel rate/min-stay tuning second.';
}

async function callGeminiWithRetry(params: {
  ai: GoogleGenAI;
  prompt: string;
  systemInstruction: string;
}): Promise<string> {
  const maxAttempts = 2;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await params.ai.models.generateContent({
        model: GEMINI_FREE_TIER_MODEL,
        contents: params.prompt,
        config: {
          systemInstruction: params.systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              shortOpportunityExplanation: { type: Type.STRING },
              pricingStrategy: { type: Type.STRING },
              minimumStayRecommendation: { type: Type.STRING },
              guestExtensionMessage: { type: Type.STRING },
              socialMediaCaption: { type: Type.STRING },
              marketingRecommendation: { type: Type.STRING },
              relevantCautions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'shortOpportunityExplanation',
              'pricingStrategy',
              'minimumStayRecommendation',
              'guestExtensionMessage',
              'socialMediaCaption',
              'marketingRecommendation',
              'relevantCautions',
            ],
          },
        },
      });
      return response.text ?? '';
    } catch (err) {
      lastErr = err;
      const classified = classifyGeminiApiError(err);
      // Do not retry non-transient auth or quota rejections
      if (
        classified.code === 'QUOTA_EXHAUSTED' ||
        classified.code === 'API_KEY_INVALID' ||
        classified.code === 'MODEL_NOT_FOUND' ||
        attempt === maxAttempts
      ) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }

  throw lastErr;
}

export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit();
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error:
            'Rate limit reached (15 requests/min) for free-tier AI strategy generation.',
          errorCode: 'QUOTA_EXHAUSTED',
          fallbackRequired: true,
        },
        {
          status: 429,
          headers: { 'X-RateLimit-Remaining': '0' },
        }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;

    // Enforce zero-PII security contract on every inbound payload
    const piiAudit = detectPiiOrDisallowedKeys(body);
    if (!piiAudit.safe) {
      return NextResponse.json(
        {
          error: `Blocked outbound AI payload due to PII/secret violation: ${piiAudit.violations.join(
            '; '
          )}`,
          errorCode: 'PII_POLICY_VIOLATION',
        },
        { status: 400 }
      );
    }

    const propertyType = String(body.propertyType ?? '');
    const city = String(body.city ?? '');
    const currency = String(body.currency ?? '');
    const nightlyRate = Number(body.nightlyRate);
    const minimumStay = Number(body.minimumStay);
    const minimumAcceptableRate = Number(body.minimumAcceptableRate);
    const gapStartDate = String(body.gapStartDate ?? '');
    const gapEndDate = String(body.gapEndDate ?? '');
    const emptyNights = Number(body.emptyNights);
    const suggestedNightlyRate = Number(body.suggestedNightlyRate);
    const suggestedGross = Number(body.suggestedGross);
    const recommendedDiscountPercent = Number(body.recommendedDiscountPercent);
    const maxAllowedDiscountPercent = Number(body.maxAllowedDiscountPercent);
    const isMinStayCompatible = Boolean(body.isMinStayCompatible ?? emptyNights >= minimumStay);
    const strategyFocus: StrategyFocusMode =
      body.strategyFocus === 'guest_extension' || body.strategyFocus === 'direct_promo'
        ? body.strategyFocus
        : 'balanced';

    if (
      !propertyType ||
      !city ||
      !currency ||
      !Number.isFinite(emptyNights) ||
      emptyNights <= 0 ||
      !Number.isFinite(suggestedNightlyRate) ||
      !Number.isFinite(suggestedGross)
    ) {
      return NextResponse.json(
        { error: 'Invalid anonymized strategy request payload.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return NextResponse.json(
        {
          error:
            'GEMINI_API_KEY is not configured in environment Secrets. Configure GEMINI_API_KEY to enable live Gemini responses.',
          errorCode: 'API_KEY_MISSING',
          fallbackRequired: true,
        },
        {
          status: 503,
          headers: { 'X-RateLimit-Remaining': String(rate.remaining) },
        }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const systemInstruction =
      'You are an honest, practical revenue operations advisor for independent Airbnb and short-term rental hosts. Return concise, non-promotional JSON matching the schema. Never alter provided financial numbers, never invent competitor occupancy rates, and never guarantee a booking.';

    const prompt = `Analyze this anonymized orphan booking gap and generate practical recommendations:
- Property: ${propertyType} in ${city}
- Gap window: ${gapStartDate} to ${gapEndDate} (${emptyNights} empty nights)
- Standard minimum stay: ${minimumStay} nights (Current gap compatible: ${
      isMinStayCompatible ? 'Yes' : 'No, temporarily blocked by min-stay rule'
    })
- Deterministic financial numbers (DO NOT ALTER):
  - Base nightly rate: ${currency} ${nightlyRate}
  - Recommended discount: ${recommendedDiscountPercent}% (Max allowed: ${maxAllowedDiscountPercent}%)
  - Suggested nightly rate: ${currency} ${suggestedNightlyRate} (Host floor price: ${currency} ${minimumAcceptableRate})
  - Estimated gross recovery: ${currency} ${suggestedGross}
- ${buildFocusDirective(strategyFocus)}`;

    const rawText = await callGeminiWithRetry({ ai, prompt, systemInstruction });
    const parsedJson = JSON.parse(rawText || '{}') as unknown;
    const validated = validateAndNormalizeStrategyResponse(parsedJson, {
      modelUsed: GEMINI_FREE_TIER_MODEL,
      strategyFocus,
    });

    if (!validated.valid) {
      return NextResponse.json(
        {
          error: `Gemini output failed schema validation: ${validated.error}`,
          errorCode: 'INVALID_MODEL_OUTPUT',
          fallbackRequired: true,
        },
        {
          status: 502,
          headers: { 'X-RateLimit-Remaining': String(rate.remaining) },
        }
      );
    }

    return NextResponse.json(validated.strategy, {
      status: 200,
      headers: {
        'X-RateLimit-Remaining': String(rate.remaining),
        'X-GapFill-Model': GEMINI_FREE_TIER_MODEL,
      },
    });
  } catch (error) {
    const classified = classifyGeminiApiError(error);
    console.error('Gemini strategy API error:', classified.code, error);
    return NextResponse.json(
      {
        error: classified.userMessage,
        errorCode: classified.code,
        fallbackRequired: true,
      },
      { status: classified.httpStatus }
    );
  }
}
