import { ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  htmlFor: string;
  children: ReactNode;
}

export function FormField({ label, htmlFor, children }: FormFieldProps) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label
        htmlFor={htmlFor}
        style={{
          display: 'block',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--ui-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '6px',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
