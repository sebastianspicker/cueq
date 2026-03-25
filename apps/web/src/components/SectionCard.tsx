interface SectionCardProps {
  children: React.ReactNode;
}

export function SectionCard({ children }: SectionCardProps) {
  return <article className="cq-section-card">{children}</article>;
}
