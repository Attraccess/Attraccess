import { PropsWithChildren, ReactNode } from 'react';
import { cn, Label, Link, SearchField, Skeleton } from '@heroui/react';
import type { DashboardWidgetSize } from '@attraccess/plugins-frontend-sdk';
import { StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';

/**
 * How many entries a widget lists at each size. Tiles have a fixed height, so widgets show a fixed number of entries
 * instead of measuring.
 */
export function itemsPerSize(size: DashboardWidgetSize, counts: Partial<Record<DashboardWidgetSize, number>>): number {
  return counts[size] ?? counts.medium ?? 3;
}

/** A search field whose term the widget searches live; Enter can open a page with it. */
export function WidgetSearch({
  label,
  value,
  onChange,
  onSubmit,
  'data-cy': dataCy,
}: Readonly<{
  label: string;
  value: string;
  onChange: (term: string) => void;
  onSubmit?: (term: string) => void;
  'data-cy'?: string;
}>) {
  return (
    <SearchField
      fullWidth
      className="min-w-0"
      value={value}
      onChange={onChange}
      onSubmit={onSubmit && (() => onSubmit(value.trim()))}
      variant="secondary"
      data-cy={dataCy}
    >
      <Label className="sr-only">{label}</Label>
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input className="min-w-0" placeholder={label} />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
}

/** One figure that fills a small tile, with its label below, e.g. a balance or a count. */
export function BigNumber({
  value,
  label,
  className,
  'data-cy': dataCy,
}: Readonly<{ value: ReactNode; label?: ReactNode; className?: string; 'data-cy'?: string }>) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className={cn('truncate text-3xl font-bold tabular-nums leading-tight', className)} data-cy={dataCy}>
        {value}
      </span>
      {label && <span className="truncate text-xs text-muted">{label}</span>}
    </div>
  );
}

/** "+N more" below a capped list, linking to the full page. */
export function MoreLink({ count, href }: Readonly<{ count: number; href: string }>) {
  const { t } = useTranslations({ en, de });
  if (count <= 0) return null;
  return (
    <Link href={href} className="text-xs" data-cy="dashboard-widget-more">
      {t('more', { count })}
    </Link>
  );
}

export function WidgetList({ children }: Readonly<PropsWithChildren>) {
  return <ul className="flex min-w-0 flex-col gap-1">{children}</ul>;
}

export function WidgetLoading() {
  const { t } = useTranslations({ en, de });
  return (
    <div className="flex flex-col gap-2" role="status" data-cy="dashboard-widget-loading">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-6 w-full rounded-lg" />
      <Skeleton className="h-6 w-2/3 rounded-lg" />
    </div>
  );
}

export function WidgetError({ title }: Readonly<{ title: string }>) {
  return (
    <div data-cy="dashboard-widget-error">
      <StatusAlert status="danger" title={title} />
    </div>
  );
}

export function WidgetEmpty({ children }: Readonly<PropsWithChildren>) {
  return <p className="text-sm text-muted">{children}</p>;
}
