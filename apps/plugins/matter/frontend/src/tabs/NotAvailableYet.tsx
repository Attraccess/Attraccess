import { Card } from '@heroui/react';
import type { ReactNode } from 'react';

/**
 * The empty state of a section whose backend comes with a later ticket: what it will be, and why it is not usable
 * yet. Deliberately no inputs or buttons: nothing here may pretend to work.
 */
export function NotAvailableYet({
  title,
  icon,
  children,
  dataCy,
}: Readonly<{ title: string; icon: ReactNode; children: ReactNode; dataCy: string }>) {
  return (
    <Card data-cy={dataCy}>
      <Card.Content className="mt:flex mt:flex-col mt:items-center mt:gap-2 mt:py-6 mt:text-center">
        <span className="mt:text-muted">{icon}</span>
        <h3 className="mt:text-base mt:font-semibold">{title}</h3>
        <div className="mt:max-w-prose mt:text-sm mt:text-muted">{children}</div>
      </Card.Content>
    </Card>
  );
}
