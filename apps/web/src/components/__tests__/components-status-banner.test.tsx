import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBanner } from '../StatusBanner';

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
