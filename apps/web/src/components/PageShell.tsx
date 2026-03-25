interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageShellProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  children: React.ReactNode;
}

export function PageShell({ title, description, breadcrumbs, children }: PageShellProps) {
  return (
    <section className="cq-page-shell" aria-label={title}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav className="cq-breadcrumbs" aria-label="Breadcrumbs">
          <ol>
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <li key={crumb.label} aria-current={isLast ? 'page' : undefined}>
                  {crumb.href && !isLast ? (
                    <a href={crumb.href}>{crumb.label}</a>
                  ) : (
                    <span>{crumb.label}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}
      <header className="cq-page-header">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="cq-page-content">{children}</div>
    </section>
  );
}
