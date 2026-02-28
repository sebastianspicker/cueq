import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'cueq',
  description: 'Integrated time-tracking, absence, and roster planning',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', backgroundColor: '#f8fafc' }}>
        {children}
      </body>
    </html>
  );
}
