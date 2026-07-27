import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../StatusBadge';
import { StatusBanner } from '../StatusBanner';
import { LoadingSpinner } from '../LoadingSpinner';
import { FormField } from '../FormField';

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------
describe('StatusBadge', () => {
  const approvedLabel = 'Approved ✓';
  it('renders the status text by default', () => {
    render(<StatusBadge status="OPEN" />);
    expect(screen.getByText('OPEN')).toBeInTheDocument();
  });

  it('renders a custom label when provided', () => {
    render(StatusBadge({ status: 'APPROVED', label: approvedLabel }));
    expect(screen.getByText(approvedLabel)).toBeInTheDocument();
  });

  it('applies ok variant class for APPROVED status', () => {
    render(<StatusBadge status="APPROVED" />);
    const badge = screen.getByText('APPROVED');
    expect(badge.className).toContain('cq-badge-ok');
  });

  it('applies error variant class for REJECTED status', () => {
    render(<StatusBadge status="REJECTED" />);
    expect(screen.getByText('REJECTED').className).toContain('cq-badge-error');
  });

  it('applies warn variant class for PENDING status', () => {
    render(<StatusBadge status="PENDING" />);
    expect(screen.getByText('PENDING').className).toContain('cq-badge-warn');
  });

  it('applies info variant class for OPEN status', () => {
    render(<StatusBadge status="OPEN" />);
    expect(screen.getByText('OPEN').className).toContain('cq-badge-info');
  });

  it('falls back to neutral for unknown status', () => {
    render(<StatusBadge status="UNKNOWN_XYZ" />);
    expect(screen.getByText('UNKNOWN_XYZ').className).toContain('cq-badge-neutral');
  });

  it('explicit variant overrides auto-resolved variant', () => {
    render(<StatusBadge status="PENDING" variant="error" />);
    expect(screen.getByText('PENDING').className).toContain('cq-badge-error');
  });

  it('is case-insensitive for status lookup', () => {
    render(<StatusBadge status="approved" />);
    expect(screen.getByText('approved').className).toContain('cq-badge-ok');
  });
});

// ---------------------------------------------------------------------------
// StatusBanner
// ---------------------------------------------------------------------------
describe('StatusBanner', () => {
  it('renders nothing visible when both message and error are null', () => {
    const { container } = render(<StatusBanner message={null} error={null} />);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('renders a success message with role=status', () => {
    render(<StatusBanner message="Saved successfully." />);
    const el = screen.getByRole('status');
    expect(el).toHaveTextContent('Saved successfully.');
  });

  it('renders an error with role=alert', () => {
    render(<StatusBanner error="Something went wrong." />);
    const el = screen.getByRole('alert');
    expect(el).toHaveTextContent('Something went wrong.');
  });

  it('renders both message and error simultaneously', () => {
    render(<StatusBanner message="Done." error="But also an error." />);
    expect(screen.getByRole('status')).toHaveTextContent('Done.');
    expect(screen.getByRole('alert')).toHaveTextContent('But also an error.');
  });
});

// ---------------------------------------------------------------------------
// LoadingSpinner
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// FormField
// ---------------------------------------------------------------------------
describe('FormField', () => {
  it('renders label text', () => {
    render(
      <FormField label="Email">
        <input type="email" />
      </FormField>,
    );
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('associates label with input via htmlFor/id', () => {
    render(
      <FormField label="Name">
        <input type="text" />
      </FormField>,
    );
    const input = screen.getByRole('textbox');
    const label = screen.getByText('Name');
    expect(label).toHaveAttribute('for', input.id);
  });

  it('renders error message with role=alert', () => {
    render(
      <FormField label="Name" error="Required field">
        <input type="text" />
      </FormField>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Required field');
  });

  it('marks input as aria-invalid when error is present', () => {
    render(
      <FormField label="Name" error="Required">
        <input type="text" />
      </FormField>,
    );
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders hint text when provided and no error', () => {
    render(
      <FormField label="Name" hint="Enter your full name">
        <input type="text" />
      </FormField>,
    );
    expect(screen.getByText('Enter your full name')).toBeInTheDocument();
  });

  it('does not render hint when error is present', () => {
    render(
      <FormField label="Name" hint="Enter your full name" error="Required">
        <input type="text" />
      </FormField>,
    );
    expect(screen.queryByText('Enter your full name')).toBeNull();
  });

  it('renders required asterisk when required=true', () => {
    render(
      <FormField label="Name" required>
        <input type="text" />
      </FormField>,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });
});
