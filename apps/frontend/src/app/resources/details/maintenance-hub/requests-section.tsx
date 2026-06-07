import { Button } from '@heroui/react';
import { useTranslations, DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { CheckCircleIcon, XCircleIcon, MessageSquareWarningIcon } from 'lucide-react';
import { useCallback } from 'react';
import {
  MaintenanceRequestStatus,
  useResourceMaintenancesServiceListMaintenanceRequests,
  useResourceMaintenancesServiceListMaintenanceRequestsKey,
  useResourceMaintenancesServiceResolveMaintenanceRequest,
  useResourceMaintenancesServiceFindMaintenancesKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { MaintenanceReasonDisplay } from '../../../../components/MaintenanceReasonDisplay';
import { SectionCard } from './section-card';
import de from './de.json';
import en from './en.json';

interface Props {
  resourceId: number;
}

export function RequestsSection(props: Props) {
  const { resourceId } = props;
  const { t } = useTranslations({ de, en });
  const queryClient = useQueryClient();

  const { data: requests } = useResourceMaintenancesServiceListMaintenanceRequests(
    { resourceId, status: MaintenanceRequestStatus.OPEN },
    undefined,
    { refetchInterval: 10_000 },
  );

  const onSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [useResourceMaintenancesServiceListMaintenanceRequestsKey] });
    queryClient.invalidateQueries({ queryKey: [useResourceMaintenancesServiceFindMaintenancesKey] });
  }, [queryClient]);

  const { mutate: resolveRequest, isPending } = useResourceMaintenancesServiceResolveMaintenanceRequest({ onSuccess });

  const open = requests?.data ?? [];
  if (open.length === 0) return null;

  return (
    <SectionCard
      icon={<MessageSquareWarningIcon className="w-4 h-4 text-warning" />}
      title={t('activity.requests.label')}
      count={open.length}
      accent="warning"
    >
      <div className="flex flex-col gap-3">
        {open.map((request) => (
          <div
            key={request.id}
            className="rounded-lg border border-warning/40 bg-warning/5 p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"
          >
            <div className="flex-1">
              <div className="font-medium mb-1">
                <MaintenanceReasonDisplay reason={request.reason} />
              </div>
              <div className="text-xs text-default-600">
                <span>
                  {t('activity.requests.reportedBy', {
                    name: (request.createdByUser as { username?: string } | null)?.username ?? t('activity.requests.someone'),
                  })}
                </span>{' '}
                · <DateTimeDisplay date={request.createdAt} />
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="primary"
                isDisabled={isPending}
                onPress={() => resolveRequest({ resourceId, requestId: request.id, requestBody: { action: 'convert' } })}
              >
                <CheckCircleIcon className="w-4 h-4" />
                {t('activity.requests.convert')}
              </Button>
              <Button
                variant="ghost"
                isDisabled={isPending}
                onPress={() => resolveRequest({ resourceId, requestId: request.id, requestBody: { action: 'dismiss' } })}
              >
                <XCircleIcon className="w-4 h-4" />
                {t('activity.requests.dismiss')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
