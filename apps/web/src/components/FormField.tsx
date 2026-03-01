interface FormFieldProps {
  label: string;
  children: React.ReactNode;
}

export function FormField({ label, children }: FormFieldProps) {
  return (
    <label className="cq-form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
