import { ButtonHTMLAttributes } from 'react';

export function Button({ children, disabled, style, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        display: 'block',
        width: '100%',
        marginTop: '16px',
        padding: '10px',
        background: 'var(--ui-accent)',
        color: 'white',
        border: 'none',
        borderRadius: 'var(--ui-radius)',
        fontSize: '0.875rem',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
