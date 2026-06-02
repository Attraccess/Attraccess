import { Alert, AlertContent, AlertDescription, AlertTitle } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useResourcesServiceResourceRetrainingGetStatus } from '@attraccess/react-query-client';
import { AlertStatusIcon } from '../../../../../components/AlertStatusIcon';
import en from './translations/en.json';
import de from './translations/de.json';

interface RetrainingStatusBannerProps {
  resourceId: number;
}

export function RetrainingStatusBanner({ resourceId }: Readonly<RetrainingStatusBannerProps>) {
  const { t } = useTranslations({ en, de });

  const { data: status } = useResourcesServiceResourceRetrainingGetStatus({ resourceId }, undefined, {
    refetchInterval: 30000,
  });

  if (!status || !status.applies || !status.isDue) {
    return null;
  }

  const variant = status.blocksAccess ? 'danger' : 'warning';
  const reasonText = status.reason === 'inactivity' ? t('reason.inactivity') : t('reason.age');

  return (
    <Alert status={variant} data-cy="retraining-status-banner">
      <AlertStatusIcon status={variant} />
      <AlertContent>
        <AlertTitle>{status.blocksAccess ? t('blocked.title') : t('due.title')}</AlertTitle>
        <AlertDescription>
          {(status.blocksAccess ? t('blocked.description') : t('due.description')) + ' ' + reasonText}
        </AlertDescription>
      </AlertContent>
    </Alert>
  );
}
