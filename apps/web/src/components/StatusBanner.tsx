interface StatusBannerProps {
  message?: string | null;
  error?: string | null;
}

export function StatusBanner({ message, error }: StatusBannerProps) {
  return (
    <div className="cq-status-stack">
      {message ? (
        <p role="status" className="cq-status-ok">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="cq-status-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
