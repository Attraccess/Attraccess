import { Alert } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';

import de from './de.json';
import en from './en.json';

export function NoResourcesFound() {
  const { t } = useTranslations('resourceOverview.noResourcesFound', {
    de,
    en,
  });
  return (
    <div>
      <Alert color="warning" title={t('alert.title')}>
        {t('alert.description')}
      </Alert>
    </div>
  );
}
