import { Alert, AlertContent, AlertDescription, AlertTitle } from '@heroui/react';
import { CheckCircleIcon } from 'lucide-react';
import {
  ResourceHealthStateDto,
  useClearResourceHealthEntry,
  useGetResourceHealth,
  useGetResourceHealthKey,
  useCanManageMaintenance,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { Button, useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

interface Props {
  resourceId: number;
}

export function ResourceHealthWarning({ resourceId }: Props) {
  const { t } = useTranslations({ en, de });
  const formatDateTime = useDateTimeFormatter({ showDate: true, showTime: true });
  const queryClient = useQueryClient();
  const { success, error: showError } = useToastMessage();

  const { data: summary } = useGetResourceHealth({ path: { resourceId } }, undefined, {
    refetchInterval: 5000,
  });

  const { data: maintenancePermissions } = useCanManageMaintenance({ path: { resourceId } });
  const canManage = maintenancePermissions?.canManage === true;

  const clearEntry = useClearResourceHealthEntry(undefined, {
    onSuccess: () => {
      success({ title: t('actions.markHealthySuccess') });
      queryClient.invalidateQueries({ queryKey: [useGetResourceHealthKey] });
    },
    onError: () => {
      showError({ title: t('actions.markHealthyError') });
    },
  });

  const handleClear = useCallback(
    (entryId: number) => {
      clearEntry.mutate({ path: { resourceId, entryId } });
    },
    [clearEntry, resourceId],
  );

  if (!summary || summary.isHealthy) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 mb-6">
      {summary.unhealthyEntries.map((entry: ResourceHealthStateDto) => {
        const identifierLabel =
          entry.identifier && entry.identifier.length > 0 ? entry.identifier : t('alert.identifier.default');

        return (
          <Alert status="danger" key={entry.id}>
            <AlertContent>
              <AlertTitle>{t('alert.title')}</AlertTitle>
              <AlertDescription>{t('alert.description')}</AlertDescription>
              <div className="flex flex-col gap-1 mt-2 text-sm w-full">
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
              {canManage && (
                <Button
                  className="mt-3 self-start"
                  variant="danger-soft"
                  onPress={() => handleClear(entry.id)}
                  isPending={clearEntry.isPending}
                >
                  <CheckCircleIcon size={16} />
                  {t('actions.markHealthy')}
                </Button>
              )}
            </AlertContent>
          </Alert>
        );
      })}
    </div>
  );
}
