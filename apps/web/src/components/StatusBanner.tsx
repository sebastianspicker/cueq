/** Accessible success and error feedback surface for asynchronous workspace actions. */
interface StatusBannerProps {
  message?: string | null;
  error?: string | null;
}

/** Announces non-error feedback and errors through their respective live roles. */
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
