import { Button } from './Button';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  ariaLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  ariaLabel,
  previousLabel,
  nextLabel,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav className="cq-pagination" aria-label={ariaLabel ?? 'Pagination'}>
      <Button
        variant="ghost"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label={previousLabel ?? 'Previous page'}
      >
        &larr;
      </Button>
      <span className="cq-pagination-info">
        {page} / {totalPages}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label={nextLabel ?? 'Next page'}
      >
        &rarr;
      </Button>
    </nav>
  );
}
