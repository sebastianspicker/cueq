/** Accessible loading indicator for asynchronous workspace sections. */
interface LoadingSpinnerProps {
  label: string;
}

/** Announces in-progress work using the supplied localized label. */
export function LoadingSpinner({ label }: LoadingSpinnerProps) {
  return (
    <div className="cq-loading" role="status">
      <span className="cq-loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
