import type { Metadata } from 'next';
import { Manrope, DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'GapFill — Turn Empty Nights Into Confirmed Airbnb Revenue',
  description:
    'Built for independent Airbnb and short-term rental hosts to spot orphan nights between bookings, protect nightly rate floors, and recover lost revenue.',
  openGraph: {
    title: 'GapFill — Turn Empty Nights Into Confirmed Airbnb Revenue',
    description:
      'Built for independent Airbnb and short-term rental hosts to spot orphan nights between bookings, protect nightly rate floors, and recover lost revenue.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GapFill — Turn Empty Nights Into Confirmed Airbnb Revenue',
    description:
      'Built for independent Airbnb and short-term rental hosts to spot orphan nights between bookings, protect nightly rate floors, and recover lost revenue.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body
        suppressHydrationWarning
        className="bg-white text-[#222222] antialiased selection:bg-[#FF385C] selection:text-white font-sans"
      >
        {children}
      </body>
    </html>
  );
}
