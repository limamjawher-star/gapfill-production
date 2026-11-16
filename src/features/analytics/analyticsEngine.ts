import {
  CurrencyCode,
  GapOpportunity,
  HostActionLog,
  Property,
  SyncRunLog,
} from '../../types/gapfill';
import { formatPropertyCurrency } from '../properties/propertyValidation';

export interface ActionFunnelMetrics {
  totalDetected: number;
  newCount: number;
  viewedCount: number;
  actionedCount: number;
  filledCount: number;
  dismissedCount: number;
  expiredCount: number;
  engagedCount: number;
  engagementRatePct: number;
  actionToFillRatePct: number;
  filledSuggestedBaseline: number;
  filledActualRecovered: number;
  filledVarianceNominal: number;
  totalActionsLogged: number;
}

/**
 * Computes deterministic conversion funnel & recovery variance metrics
 * without ever blending estimated open opportunity with actual recovered revenue.
 */
export function computeActionFunnelMetrics(
  opportunities: GapOpportunity[],
  actions: HostActionLog[]
): ActionFunnelMetrics {
  let newCount = 0;
  let viewedCount = 0;
  let actionedCount = 0;
  let filledCount = 0;
  let dismissedCount = 0;
  let expiredCount = 0;
  let filledSuggestedBaseline = 0;
  let filledActualRecovered = 0;

  for (const opp of opportunities) {
    switch (opp.status) {
      case 'new':
        newCount += 1;
        break;
      case 'viewed':
        viewedCount += 1;
        break;
      case 'actioned':
        actionedCount += 1;
        break;
      case 'filled':
        filledCount += 1;
        filledSuggestedBaseline += opp.financials.suggestedGross;
        filledActualRecovered += opp.actualRecoveredRevenue ?? 0;
        break;
      case 'dismissed':
        dismissedCount += 1;
        break;
      case 'expired':
        expiredCount += 1;
        break;
    }
  }

  const totalDetected = opportunities.length;
  const engagedCount = viewedCount + actionedCount + filledCount;
  const engagementRatePct =
    totalDetected > 0 ? Math.round((engagedCount / totalDetected) * 100) : 0;

  const actionedOrFilled = actionedCount + filledCount;
  const actionToFillRatePct =
    actionedOrFilled > 0
      ? Math.round((filledCount / actionedOrFilled) * 100)
      : 0;

  return {
    totalDetected,
    newCount,
    viewedCount,
    actionedCount,
    filledCount,
    dismissedCount,
    expiredCount,
    engagedCount,
    engagementRatePct,
    actionToFillRatePct,
    filledSuggestedBaseline,
    filledActualRecovered,
    filledVarianceNominal: filledActualRecovered - filledSuggestedBaseline,
    totalActionsLogged: actions.length,
  };
}

export interface PropertyAnalyticsRow {
  propertyId: string;
  name: string;
  shortLabel: string;
  city: string;
  currency: CurrencyCode;
  openGapCount: number;
  filledGapCount: number;
  emptyNights: number;
  estimatedOpportunity: number;
  actualRecovered: number;
  formattedEstimated: string;
  formattedRecovered: string;
}

export function buildPropertyAnalyticsBreakdown(
  properties: Property[],
  opportunities: GapOpportunity[]
): PropertyAnalyticsRow[] {
  return properties.map((prop) => {
    const propOpps = opportunities.filter((o) => o.propertyId === prop.id);
    const openOpps = propOpps.filter(
      (o) => o.status === 'new' || o.status === 'viewed' || o.status === 'actioned'
    );
    const filledOpps = propOpps.filter((o) => o.status === 'filled');

    const estimatedOpportunity = openOpps.reduce(
      (acc, o) => acc + o.financials.suggestedGross,
      0
    );
    const actualRecovered = filledOpps.reduce(
      (acc, o) => acc + (o.actualRecoveredRevenue ?? 0),
      0
    );
    const emptyNights = propOpps
      .filter((o) => o.status !== 'dismissed')
      .reduce((acc, o) => acc + o.emptyNights, 0);

    return {
      propertyId: prop.id,
      name: prop.name,
      shortLabel: `${prop.city} ${prop.propertyType}`,
      city: prop.city,
      currency: prop.currency,
      openGapCount: openOpps.length,
      filledGapCount: filledOpps.length,
      emptyNights,
      estimatedOpportunity,
      actualRecovered,
      formattedEstimated: formatPropertyCurrency(
        estimatedOpportunity,
        prop.currency
      ),
      formattedRecovered: formatPropertyCurrency(actualRecovered, prop.currency),
    };
  });
}

export interface MonthlyTrendRow {
  yearMonth: string;
  month: string;
  estimatedOpportunity: number;
  actualRecovered: number;
  openNights: number;
  filledNights: number;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function buildMonthlyTrendSeries(
  opportunities: GapOpportunity[]
): MonthlyTrendRow[] {
  const map = new Map<string, MonthlyTrendRow>();

  for (const opp of opportunities) {
    if (opp.status === 'dismissed') continue;
    const ym = opp.gapStartDate.slice(0, 7);
    const [year, monthStr] = ym.split('-');
    const mIdx = Number(monthStr) - 1;
    const label =
      mIdx >= 0 && mIdx < 12 ? `${MONTH_NAMES[mIdx]} ${year}` : ym;

    const entry = map.get(ym) ?? {
      yearMonth: ym,
      month: label,
      estimatedOpportunity: 0,
      actualRecovered: 0,
      openNights: 0,
      filledNights: 0,
    };

    if (opp.status === 'filled') {
      entry.actualRecovered += opp.actualRecoveredRevenue ?? 0;
      entry.filledNights += opp.emptyNights;
    } else if (
      opp.status === 'new' ||
      opp.status === 'viewed' ||
      opp.status === 'actioned'
    ) {
      entry.estimatedOpportunity += opp.financials.suggestedGross;
      entry.openNights += opp.emptyNights;
    }

    map.set(ym, entry);
  }

  return Array.from(map.values()).sort((a, b) =>
    a.yearMonth.localeCompare(b.yearMonth)
  );
}

export function filterActivityLogs(params: {
  actions: HostActionLog[];
  properties: Property[];
  propertyId: string;
  actionType: string;
  searchQuery: string;
}): HostActionLog[] {
  const propNameMap = new Map<string, string>();
  for (const p of params.properties) {
    propNameMap.set(p.id, p.name);
  }

  const query = params.searchQuery.trim().toLowerCase();

  return params.actions.filter((act) => {
    if (params.propertyId !== 'all' && act.propertyId !== params.propertyId) {
      return false;
    }
    if (params.actionType !== 'all' && act.actionType !== params.actionType) {
      return false;
    }
    if (query) {
      const propName = propNameMap.get(act.propertyId) ?? '';
      const hay = `${propName} ${act.actionType} ${act.description}`.toLowerCase();
      if (!hay.includes(query)) {
        return false;
      }
    }
    return true;
  });
}

export function filterSyncRuns(params: {
  syncRuns: SyncRunLog[];
  properties: Property[];
  propertyId: string;
  syncStatus: string;
  searchQuery: string;
}): SyncRunLog[] {
  const propNameMap = new Map<string, string>();
  for (const p of params.properties) {
    propNameMap.set(p.id, p.name);
  }

  const query = params.searchQuery.trim().toLowerCase();

  return params.syncRuns.filter((run) => {
    if (params.propertyId !== 'all' && run.propertyId !== params.propertyId) {
      return false;
    }
    if (params.syncStatus !== 'all' && run.status !== params.syncStatus) {
      return false;
    }
    if (query) {
      const propName = propNameMap.get(run.propertyId) ?? '';
      const hay = `${propName} ${run.status} ${run.message}`.toLowerCase();
      if (!hay.includes(query)) {
        return false;
      }
    }
    return true;
  });
}

function escapeCsvCell(value: string): string {
  // Prevent CSV formula injection (=, +, -, @, tab, CR)
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

/**
 * Generates an RFC 4180 CSV audit export of host activity with formula-injection protection.
 */
export function formatActivityAuditCsv(
  actions: HostActionLog[],
  properties: Property[]
): string {
  const propMap = new Map<string, Property>();
  for (const p of properties) {
    propMap.set(p.id, p);
  }

  const header = [
    'Timestamp UTC',
    'Property',
    'Currency',
    'Action Type',
    'Recovered Amount',
    'Description',
  ].join(',');

  const rows = actions.map((act) => {
    const prop = propMap.get(act.propertyId);
    return [
      escapeCsvCell(act.createdAt),
      escapeCsvCell(prop?.name ?? 'Workspace'),
      escapeCsvCell(prop?.currency ?? ''),
      escapeCsvCell(act.actionType),
      escapeCsvCell(
        typeof act.recoveredAmount === 'number' ? String(act.recoveredAmount) : ''
      ),
      escapeCsvCell(act.description),
    ].join(',');
  });

  return [header, ...rows].join('\n');
}
