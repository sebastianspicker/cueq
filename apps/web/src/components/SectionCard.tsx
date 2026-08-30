interface SectionCardProps {
  children: React.ReactNode;
  className?: string;
}

/** Uses an article element so grouped workspace content keeps sectioning semantics. */
export function SectionCard({ children, className }: SectionCardProps) {
  const classes = ['cq-section-card', className].filter(Boolean).join(' ');
  return <article className={classes}>{children}</article>;
}
