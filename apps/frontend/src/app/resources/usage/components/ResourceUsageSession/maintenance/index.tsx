import {
  useResourceMaintenancesServiceCanManageMaintenance,
  useResourceMaintenancesServiceFindMaintenances,
} from '@attraccess/react-query-client';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { MaintenanceReasonDisplay } from '../../../../../../components/MaintenanceReasonDisplay';
import { StartSessionControls } from '../../StartSessionControls';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@heroui/react';
import { ConstructionIcon } from 'lucide-react';

import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
}

export function MaintenanceInProgressDisplay(props: Props) {
  const { resourceId } = props;

  const { t } = useTranslations({ en, de });

  const { data: activeMaintenances } = useResourceMaintenancesServiceFindMaintenances(
    {
      resourceId,
      includeActive: true,
      includeUpcoming: false,
      includePast: false,
    },
    undefined,
    {
      refetchInterval: 5000,
    },
  );

  const { data: permissions } = useResourceMaintenancesServiceCanManageMaintenance({
    resourceId,
  });

  const formatDateTime = useDateTimeFormatter({ showDate: true, showTime: true });

  return (
    <div className="flex flex-col gap-4">
      {(activeMaintenances?.data ?? []).map((maintenance) => (
        <Alert status="warning"
          key={maintenance.id}
        >
          <AlertContent>
            <AlertTitle>{t('alert.title')}</AlertTitle>
            <AlertDescription>{t('alert.description', {
            start: formatDateTime(maintenance.startTime, t('alert.noDate')),
            end: formatDateTime(maintenance.endTime, t('alert.noDate')),
          })}</AlertDescription>
          </AlertContent>
          <small className="text-sm text-gray-500 mt-4 ">{t('alert.reason.label')}</small>
          <p className="text-lg whitespace-pre-wrap">
            <MaintenanceReasonDisplay reason={maintenance.reason} fallback={t('alert.reason.noReason')} />
          </p>
        </Alert>
      ))}

      {permissions?.canManage && <StartSessionControls resourceId={resourceId} />}
    </div>
  );
}
