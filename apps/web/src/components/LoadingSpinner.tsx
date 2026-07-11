interface LoadingSpinnerProps {
  label: string;
}

export function LoadingSpinner({ label }: LoadingSpinnerProps) {
  return (
    <div className="cq-loading" role="status">
      <span className="cq-loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
