import { HTMLAttributes } from 'react';

interface StatusTextProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'ok' | 'error';
}

export function StatusText({ variant = 'default', children, style, ...props }: StatusTextProps) {
  const colors: Record<string, string> = {
    default: 'var(--ui-text-muted)',
    ok: 'var(--ui-success)',
    error: 'var(--ui-error)',
  };

  return (
    <div
      {...props}
      style={{
        marginTop: '12px',
        fontSize: '0.8rem',
        color: colors[variant],
        textAlign: 'center',
        minHeight: '1.2em',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
