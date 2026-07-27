import Link from 'next/link';

interface BrandMarkProps {
  href: string;
  descriptor?: string;
  variant?: 'sidebar' | 'compact';
}

/** Renders the canonical lowercase cueq identity as accessible, code-native UI. */
export function BrandMark({ href, descriptor, variant = 'sidebar' }: BrandMarkProps) {
  return (
    <Link
      className="cq-brand-mark"
      data-variant={variant}
      href={href}
      aria-label={descriptor ? `cueq: ${descriptor}` : 'cueq'}
    >
      <svg className="cq-brand-symbol" viewBox="0 0 64 44" aria-hidden="true" focusable="false">
        <path d="M25 8C17.3 8 11 14.3 11 22s6.3 14 14 14" />
        <path d="M39 8c7.7 0 14 6.3 14 14s-6.3 14-14 14" />
        <path d="m48.5 32.5 7 7" />
      </svg>
      <span className="cq-brand-copy">
        <strong>cueq</strong>
        {descriptor ? <span>{descriptor}</span> : null}
      </span>
    </Link>
  );
}
