interface FormFieldProps {
  label: string;
  children: React.ReactNode;
}

export function FormField({ label, children }: FormFieldProps) {
  return (
    <label className="cq-form-field">
      <span className="cq-form-label">{label}</span>
      {children}
    </label>
  );
}
