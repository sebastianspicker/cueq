import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusBadge } from '../StatusBadge';
import { StatusBanner } from '../StatusBanner';
import { Button } from '../Button';
import { LoadingSpinner } from '../LoadingSpinner';
import { EmptyState } from '../EmptyState';
import { Pagination } from '../Pagination';
import { FormField } from '../FormField';

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------
describe('StatusBadge', () => {
  it('renders the status text by default', () => {
    render(<StatusBadge status="OPEN" />);
    expect(screen.getByText('OPEN')).toBeInTheDocument();
  });

  it('renders a custom label when provided', () => {
    render(<StatusBadge status="APPROVED" label="Approved ✓" />);
    expect(screen.getByText('Approved ✓')).toBeInTheDocument();
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
// Button
// ---------------------------------------------------------------------------
describe('Button', () => {
  it('renders children', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is disabled and aria-busy when loading=true', () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('applies danger variant class', () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole('button').className).toContain('cq-btn-danger');
  });

  it('applies ghost variant class', () => {
    render(<Button variant="ghost">Cancel</Button>);
    expect(screen.getByRole('button').className).toContain('cq-btn-ghost');
  });

  it('applies sm size class', () => {
    render(<Button size="sm">Tiny</Button>);
    expect(screen.getByRole('button').className).toContain('cq-btn-sm');
  });

  it('fires onClick handler when clicked', async () => {
    const handler = vi.fn();
    render(<Button onClick={handler}>Click me</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not fire onClick when disabled', async () => {
    const handler = vi.fn();
    render(
      <Button disabled onClick={handler}>
        Nope
      </Button>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// LoadingSpinner
// ---------------------------------------------------------------------------
describe('LoadingSpinner', () => {
  it('renders with default sr-only label', () => {
    render(<LoadingSpinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders custom label text', () => {
    render(<LoadingSpinner label="Bitte warten…" />);
    expect(screen.getByText('Bitte warten…')).toBeInTheDocument();
  });

  it('includes aria-hidden spinner span', () => {
    render(<LoadingSpinner />);
    const spinner = document.querySelector('[aria-hidden="true"]');
    expect(spinner).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------
describe('EmptyState', () => {
  it('renders message text', () => {
    render(<EmptyState message="No items found." />);
    expect(screen.getByText('No items found.')).toBeInTheDocument();
  });

  it('has role=status', () => {
    render(<EmptyState message="Empty." />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('applies cq-empty-state class', () => {
    render(<EmptyState message="x" />);
    expect(screen.getByRole('status').className).toContain('cq-empty-state');
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
describe('Pagination', () => {
  it('renders nothing when totalPages <= 1', () => {
    const { container } = render(<Pagination page={1} totalPages={1} onPageChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders Previous and Next buttons for multi-page', () => {
    render(<Pagination page={2} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByLabelText('Previous page')).toBeInTheDocument();
    expect(screen.getByLabelText('Next page')).toBeInTheDocument();
  });

  it('shows current page and total', () => {
    render(<Pagination page={3} totalPages={7} onPageChange={vi.fn()} />);
    expect(screen.getByText('3 / 7')).toBeInTheDocument();
  });

  it('Previous button is disabled on first page', () => {
    render(<Pagination page={1} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByLabelText('Previous page')).toBeDisabled();
  });

  it('Next button is disabled on last page', () => {
    render(<Pagination page={5} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByLabelText('Next page')).toBeDisabled();
  });

  it('calls onPageChange with decremented page when Previous clicked', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByLabelText('Previous page'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with incremented page when Next clicked', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByLabelText('Next page'));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('respects custom aria label', () => {
    render(<Pagination page={1} totalPages={3} onPageChange={vi.fn()} ariaLabel="Results nav" />);
    expect(screen.getByRole('navigation', { name: 'Results nav' })).toBeInTheDocument();
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
