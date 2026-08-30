import Link from 'next/link';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageShellProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  headerAside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function PageShell({
  title,
  description,
  breadcrumbs,
  headerAside,
  className,
  children,
}: PageShellProps) {
  const classes = ['cq-page-shell', className].filter(Boolean).join(' ');

  return (
    <section className={classes} aria-label={title}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav className="cq-breadcrumbs" aria-label="Breadcrumbs">
          <ol>
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <li key={crumb.label} aria-current={isLast ? 'page' : undefined}>
                  {crumb.href && !isLast ? (
                    <Link href={crumb.href}>{crumb.label}</Link>
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
        <div>
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {headerAside ? <div className="cq-page-header-aside">{headerAside}</div> : null}
      </header>
      <div className="cq-page-content">{children}</div>
    </section>
  );
}
