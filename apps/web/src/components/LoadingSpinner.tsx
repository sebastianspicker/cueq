interface LoadingSpinnerProps {
  label?: string;
}

export function LoadingSpinner({ label }: LoadingSpinnerProps) {
  return (
    <div className="cq-loading" role="status">
      <span className="cq-loading-spinner" aria-hidden="true" />
      {label ? <span>{label}</span> : <span className="cq-sr-only">Loading…</span>}
    </div>
  );
}
