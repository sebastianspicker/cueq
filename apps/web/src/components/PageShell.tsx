interface PageShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <section className="cq-page-shell" aria-label={title}>
      <header className="cq-page-header">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="cq-page-content">{children}</div>
    </section>
  );
}
