/** Minimal document shell for locale-resolving redirect routes. */
import '../globals.css';

/** Provides the HTML shell while the redirect route selects a locale. */
export default function RedirectLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
