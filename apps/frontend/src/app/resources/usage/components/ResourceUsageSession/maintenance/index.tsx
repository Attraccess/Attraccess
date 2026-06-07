import {
  useResourceMaintenancesServiceCanManageMaintenance,
  useResourceMaintenancesServiceFindMaintenances,
} from '@attraccess/react-query-client';
import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { MaintenanceReasonDisplay } from '../../../../../../components/MaintenanceReasonDisplay';
import { ResourceIntroducersList } from '../../../../../../components/ResourceIntroducersList';
import { StartSessionControls } from '../../StartSessionControls';
import { MarkDoneModal } from '../../../../details/maintenance-management/mark-done';
import { Alert, AlertContent, AlertDescription, AlertTitle, Button } from '@heroui/react';
import { CheckCircleIcon } from 'lucide-react';

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
            <div className="mt-4 flex flex-col">
              <small className="text-sm text-gray-500">{t('alert.reason.label')}</small>
              <p className="text-lg whitespace-pre-wrap">
                <MaintenanceReasonDisplay reason={maintenance.reason} fallback={t('alert.reason.noReason')} />
              </p>
            </div>
            {permissions?.canManage && (
              <div className="mt-4">
                <MarkDoneModal resourceId={resourceId} maintenanceId={maintenance.id}>
                  {(open) => (
                    <Button variant="primary" onPress={open} className="w-full sm:w-auto">
                      <CheckCircleIcon className="w-4 h-4" />
                      {t('alert.markDone')}
                    </Button>
                  )}
                </MarkDoneModal>
              </div>
            )}
          </AlertContent>
        </Alert>
      ))}

      <ResourceIntroducersList resourceId={resourceId} title={t('maintainers')} />

      {permissions?.canManage && <StartSessionControls resourceId={resourceId} />}
    </div>
  );
}
