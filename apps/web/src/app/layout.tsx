import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'cueq — Zeiterfassung',
  description: 'Integriertes Zeiterfassungs-, Abwesenheits- und Dienstplansystem',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
