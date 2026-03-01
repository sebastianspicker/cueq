interface PageShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <section className="cq-page-shell">
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  );
}
