import { Alert } from '@heroui/react';
import { AlertTriangleIcon } from 'lucide-react';
import {
  ResourceHealthStateDto,
  useResourceHealthServiceGetResourceHealth,
} from '@attraccess/react-query-client';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

interface Props {
  resourceId: number;
}

export function ResourceHealthWarning({ resourceId }: Props) {
  const { t } = useTranslations({ en, de });
  const formatDateTime = useDateTimeFormatter({ showDate: true, showTime: true });

  const { data: summary } = useResourceHealthServiceGetResourceHealth(
    { resourceId },
    undefined,
    { refetchInterval: 5000 },
  );

  if (!summary || summary.isHealthy) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {summary.unhealthyEntries.map((entry: ResourceHealthStateDto) => {
        const identifierLabel =
          entry.identifier && entry.identifier.length > 0
            ? entry.identifier
            : t('alert.identifier.default');

        return (
          <Alert
            key={entry.id}
            color="danger"
            title={t('alert.title')}
            icon={<AlertTriangleIcon />}
            description={t('alert.description')}
          >
            <div className="flex flex-col gap-1 mt-2 text-sm">
              <div>
                <span className="text-gray-500 mr-1">{t('alert.identifier.label')}:</span>
                <span className="font-medium">{identifierLabel}</span>
              </div>
              <div>
                <span className="text-gray-500 mr-1">{t('alert.reason.label')}:</span>
                <span className="whitespace-pre-wrap">
                  {entry.reason && entry.reason.length > 0 ? entry.reason : t('alert.reason.noReason')}
                </span>
              </div>
              <div>
                <span className="text-gray-500 mr-1">{t('alert.lastSeen')}:</span>
                <span>{formatDateTime(entry.lastReportedAt, '')}</span>
              </div>
            </div>
          </Alert>
        );
      })}
    </div>
  );
}
