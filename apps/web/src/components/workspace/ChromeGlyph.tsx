import type { ReactNode } from 'react';

type ChromeGlyphName = 'search' | 'sun' | 'moon' | 'close';

const GLYPHS: Record<ChromeGlyphName, ReactNode> = {
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="5.7" />
      <path d="m15.1 15.1 4.2 4.2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </>
  ),
  moon: <path d="M19.4 15.1A8.2 8.2 0 0 1 8.9 4.6 8.2 8.2 0 1 0 19.4 15.1Z" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
};

export function ChromeGlyph({ name }: { name: ChromeGlyphName }) {
  return (
    <svg
      className="cq-chrome-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[name]}
    </svg>
  );
}
