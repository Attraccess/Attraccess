import { I18nProvider } from '@heroui/react';
import { useDateTimeLocale } from '@attraccess/plugins-frontend-ui';
import { PropsWithChildren } from 'react';

/** Scope date entry formatting without changing translation or number formatting. */
export function DateTimeLocaleProvider({ children }: PropsWithChildren) {
  const locale = useDateTimeLocale();
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}
