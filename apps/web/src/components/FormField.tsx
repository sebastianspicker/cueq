import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  children: ReactNode;
  error?: string | null;
  hint?: string;
  required?: boolean;
}

export function FormField({ label, children, error, hint, required }: FormFieldProps) {
  const autoId = useId();
  const errorId = error ? `${autoId}-error` : undefined;
  const hintId = hint ? `${autoId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  const input = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: autoId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })
    : children;

  return (
    <div className={`cq-form-field${error ? ' cq-form-field-error' : ''}`}>
      <label className="cq-form-label" htmlFor={autoId}>
        {label}
        {required ? <span className="cq-form-required" aria-hidden="true"> *</span> : null}
      </label>
      {input}
      {hint && !error ? (
        <p id={hintId} className="cq-form-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="cq-form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
