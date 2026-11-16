import { PropsWithChildren, ReactNode, useState } from 'react';
import { Button, cn, Label, Link, SearchField, Skeleton } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { SearchIcon } from 'lucide-react';
import { StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';

/** A quick action that opens a page, styled as a button. */
export function WidgetLinkButton({
  href,
  icon,
  children,
  'data-cy': dataCy,
}: Readonly<PropsWithChildren<{ href: string; icon?: ReactNode; 'data-cy'?: string }>>) {
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'no-underline')}
      data-cy={dataCy}
    >
      {icon}
      {children}
    </Link>
  );
}

export function WidgetActions({ children }: Readonly<PropsWithChildren>) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

/** A search field whose submitted term opens a page with it, e.g. `/users?q=…`. */
export function WidgetSearch({
  label,
  submitLabel,
  onSearch,
  'data-cy': dataCy,
}: Readonly<{ label: string; submitLabel: string; onSearch: (term: string) => void; 'data-cy'?: string }>) {
  const [term, setTerm] = useState('');
  const submit = () => onSearch(term.trim());

  return (
    <div className="flex items-end gap-2">
      <SearchField
        fullWidth
        className="min-w-0"
        value={term}
        onChange={setTerm}
        onSubmit={submit}
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
      <Button isIconOnly className="shrink-0" variant="secondary" aria-label={submitLabel} onPress={submit}>
        <SearchIcon className="w-4 h-4" />
      </Button>
    </div>
  );
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
