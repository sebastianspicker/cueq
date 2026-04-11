interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <p className="cq-empty-state" role="status">
      {message}
    </p>
  );
}
