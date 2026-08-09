import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '../LoadingSpinner';

describe('LoadingSpinner', () => {
  const englishLoadingLabel = 'Loading…';
  const germanLoadingLabel = 'Bitte warten…';

  it('renders its accessible label', () => {
    render(<LoadingSpinner label={englishLoadingLabel} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(englishLoadingLabel)).toBeInTheDocument();
  });

  it('renders custom label text', () => {
    render(LoadingSpinner({ label: germanLoadingLabel }));
    expect(screen.getByText(germanLoadingLabel)).toBeInTheDocument();
  });

  it('includes aria-hidden spinner span', () => {
    render(<LoadingSpinner label={englishLoadingLabel} />);
    const spinner = document.querySelector('[aria-hidden="true"]');
    expect(spinner).not.toBeNull();
  });
});
