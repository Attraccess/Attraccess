import { InputHTMLAttributes } from 'react';

export function Input({ style, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        display: 'block',
        width: '100%',
        padding: '10px 12px',
        background: 'var(--ui-input-bg)',
        border: '1px solid var(--ui-border)',
        borderRadius: 'var(--ui-radius)',
        color: 'var(--ui-text)',
        fontSize: '0.875rem',
        outline: 'none',
        boxSizing: 'border-box',
        ...style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--ui-accent)';
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'var(--ui-border)';
        props.onBlur?.(e);
      }}
    />
  );
}
