// Reusable toolbar row rendered above a HeroUI v3 Table, matching row-card chrome
// FEATURE: Standardize the table-search pattern across the frontend application

import type { ReactNode } from 'react';
import { cn } from '@heroui/react';

interface Props {
  search?: ReactNode;
  filter?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function TableToolbar(props: Props) {
  const { search, filter, actions, children, className } = props;

  return (
    <div
      className={cn('mb-4 flex flex-wrap items-center gap-3 border-b border-separator pb-4', className)}
      data-cy="table-toolbar"
    >
      {search && <div className="min-w-0 flex-1">{search}</div>}
      {filter && <div className="flex shrink-0 items-center gap-2">{filter}</div>}
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      {children}
    </div>
  );
}
