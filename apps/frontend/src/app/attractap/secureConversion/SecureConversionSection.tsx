import type { ReactNode } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import de from './de.json';
import en from './en.json';

/** The titled block "Secure this reader" sits in, inside the reader editor's security area. */
export function SecureConversionSection(props: Readonly<{ children: ReactNode }>) {
  const { t } = useTranslations({ de, en });
  return (
    <div className="flex flex-col gap-3" data-cy="secure-conversion">
      <h3 className="font-semibold">{t('title')}</h3>
      {props.children}
    </div>
  );
}
