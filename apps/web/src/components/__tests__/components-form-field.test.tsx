import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormField } from '../FormField';

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
