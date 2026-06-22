import { HTMLAttributes } from 'react';

export function Card({ children, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      style={{
        background: 'var(--ui-surface)',
        borderRadius: 'var(--ui-radius-lg)',
        padding: '32px',
        width: '100%',
        maxWidth: '420px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
