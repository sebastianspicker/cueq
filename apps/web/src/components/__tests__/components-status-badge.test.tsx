import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../StatusBadge';

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
