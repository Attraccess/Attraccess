import { Button, PageHeader, StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import { RotateCwIcon } from 'lucide-react';
import { UnauthorizedLayout } from '../../app/unauthorized/unauthorized-layout/layout';

import de from './de.json';
import en from './en.json';

interface CurrentUserLoadErrorProps {
  /** Loads the current user again. */
  onRetry: () => void;
  /** Whether that request (or one of its retries) is still running. */
  isRetrying: boolean;
}

/** Full-page notice when the current user could not be loaded for a reason other than a missing session. */
export function CurrentUserLoadError({ onRetry, isRetrying }: Readonly<CurrentUserLoadErrorProps>) {
  const { t } = useTranslations({ de, en });

  return (
    <UnauthorizedLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="flex flex-col gap-4">
        <StatusAlert status="danger" title={t('alert.title')}>
          {t('alert.description')}
        </StatusAlert>
        <Button variant="primary" className="w-full" onPress={onRetry} isPending={isRetrying}>
          <RotateCwIcon className="size-4" aria-hidden />
          {t('actions.retry')}
        </Button>
      </div>
    </UnauthorizedLayout>
  );
}
