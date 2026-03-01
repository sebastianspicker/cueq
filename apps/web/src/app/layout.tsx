import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'cueq',
  description: 'Integrated time-tracking, absence, and roster planning',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
