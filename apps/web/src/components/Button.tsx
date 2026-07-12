import { forwardRef, type MouseEventHandler, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
  value?: string | number;
  form?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: '',
  secondary: 'cq-btn-secondary',
  danger: 'cq-btn-danger',
  ghost: 'cq-btn-ghost',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'cq-btn-sm',
  md: '',
  lg: 'cq-btn-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    className,
    children,
    id,
    name,
    title,
    type = 'button',
    value,
    form,
    onClick,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
  },
  ref,
) {
  const classes = [
    variantClass[variant],
    sizeClass[size],
    loading ? 'cq-btn-loading' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      id={id}
      name={name}
      title={title}
      type={type}
      value={value}
      form={form}
      onClick={onClick}
      className={classes || undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
    >
      {children}
    </button>
  );
});
