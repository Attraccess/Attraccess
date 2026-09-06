// Shared section wrapper rendering icon, uppercase title, optional actions, body
// FEATURE: Cross-page visual hierarchy after Card-wrapper removal (ATT-359)
import { cn } from '@heroui/react';
import { HTMLAttributes, ReactNode } from 'react';

interface FlatSectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  icon: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
}

export function FlatSection({ icon, title, actions, children, className, ...rest }: FlatSectionProps) {
  return (
    <section className={cn('w-full', className)} {...rest}>
      <header className="flex items-center justify-between gap-2 flex-wrap border-b border-separator pb-2 mb-3">
        <div className="flex items-center gap-2 text-accent">
          {icon}
          <h3 className="text-xs font-semibold uppercase tracking-wider">{title}</h3>
        </div>
        {actions ? <div className="flex items-center gap-2 flex-wrap">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}
