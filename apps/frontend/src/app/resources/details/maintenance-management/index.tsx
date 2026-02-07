import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardProps,
  cn,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { PageHeader } from '../../../../components/pageHeader';
import { ResourceMaintenance, useResourceMaintenancesServiceFindMaintenances, useResourceMaintenancesServiceFindMaintenancesKey, useResourceMaintenancesServiceFinishMaintenance } from '@attraccess/react-query-client';
import { useMemo, useState } from 'react';
import { DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';

import de from './de.json';
import en from './en.json';
import { ResourceMaintenanceUpsertModal } from './upsert';
import { CheckCircleIcon, CogIcon, ConstructionIcon, PencilIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { ResourceMaintenanceCancelModal } from './cancel';
import { useNow } from '../../../../hooks/useNow';
import { EmptyState } from '../../../../components/emptyState';
import { useReactQueryStatusToHeroUiTableLoadingState } from '../../../../hooks/useReactQueryStatusToHeroUiTableLoadingState';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  resourceId: number;
}

export function MaintenanceManagement(props: Props & Omit<CardProps, 'children'>) {
  const { resourceId, ...cardProps } = props;

  const { t } = useTranslations({
    de,
    en,
  });

  const formatReason = useMemo(
    () => (reason: string | null | undefined) => {
      if (reason == null || reason === '') return '';
      try {
        const parsed = JSON.parse(reason) as { i18nKey?: string; details?: Record<string, number | string> };
        if (parsed?.i18nKey && typeof parsed.details === 'object') {
          const { scheduleName, ...rest } = parsed.details;
          const text = t(parsed.i18nKey, rest as Record<string, string | number>);
          return scheduleName ? `${text} (${scheduleName})` : text;
        }
      } catch {
        // not JSON or legacy reason
      }
      return reason;
    },
    [t]
  );

  const [includePast, setIncludePast] = useState(false);
  const queryClient = useQueryClient();

  const { mutate: finishMaintenance, isPending: isFinishing } = useResourceMaintenancesServiceFinishMaintenance({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [useResourceMaintenancesServiceFindMaintenancesKey] });
    },
  });

  const { data: maintenances, status: fetchStatus } = useResourceMaintenancesServiceFindMaintenances({
    resourceId,
    includePast,
    includeActive: true,
    includeUpcoming: true,
  });

  const now = useNow();

  const maintenanceWithStatus = useMemo(
    () =>
      (maintenances?.data ?? []).map((maintenance: ResourceMaintenance) => {
        const isActive =
          new Date(maintenance.startTime) < now && (!maintenance.endTime || new Date(maintenance.endTime) > now);

        const isPast = maintenance.endTime && new Date(maintenance.endTime) < now;

        return {
          ...maintenance,
          isActive,
          isPast,
        };
      }),
    [maintenances?.data, now],
  );

  const tableLoadingState = useReactQueryStatusToHeroUiTableLoadingState(fetchStatus);

  return (
    <Card {...cardProps}>
      <CardHeader>
        <PageHeader
          title={t('title')}
          icon={<ConstructionIcon />}
          noMargin
          actions={
            <>
              <Switch isSelected={includePast} onValueChange={setIncludePast}>
                {t('filters.includePast')}
              </Switch>
              <ResourceMaintenanceUpsertModal resourceId={resourceId}>
                {(open) => (
                  <Button
                    onPress={open}
                    color="primary"
                    size="sm"
                    title={t('actions.create.title')}
                    startContent={<PlusIcon className="w-4 h-4" />}
                  >
                    {t('actions.create.label')}
                  </Button>
                )}
              </ResourceMaintenanceUpsertModal>
            </>
          }
        />
      </CardHeader>

      <CardBody>
        <Table removeWrapper aria-label={t('table.ariaLabel')}>
          <TableHeader>
            <TableColumn>{t('table.columns.start')}</TableColumn>
            <TableColumn>{t('table.columns.end')}</TableColumn>
            <TableColumn>{t('table.columns.reason')}</TableColumn>
            <TableColumn>
              <CogIcon />
            </TableColumn>
          </TableHeader>
          <TableBody items={maintenanceWithStatus} loadingState={tableLoadingState} emptyContent={<EmptyState />}>
            {(maintenance) => (
              <TableRow
                className={cn(
                  maintenance.isActive && 'border-l-8 border-l-warning',
                  maintenance.isPast && 'line-through',
                )}
              >
                <TableCell>
                  <DateTimeDisplay date={maintenance.startTime} />
                </TableCell>
                <TableCell>
                  <DateTimeDisplay date={maintenance.endTime} />
                </TableCell>
                <TableCell className="overflow-hidden text-ellipsis" title={formatReason(maintenance.reason)}>
                  {formatReason(maintenance.reason)}
                </TableCell>
                <TableCell align="right">
                  {maintenance.isActive && (
                    <Button
                      isIconOnly
                      startContent={<CheckCircleIcon className="w-4 h-4" />}
                      title={t('actions.markDone.title')}
                      onPress={() => finishMaintenance({ resourceId, maintenanceId: maintenance.id, requestBody: {} })}
                      isLoading={isFinishing}
                      color="success"
                      variant="light"
                    />
                  )}
                  <ResourceMaintenanceUpsertModal resourceId={resourceId} maintenanceId={maintenance.id}>
                    {(open) => <Button onPress={open} isIconOnly startContent={<PencilIcon className="w-4 h-4" />} />}
                  </ResourceMaintenanceUpsertModal>
                  <ResourceMaintenanceCancelModal resourceId={resourceId} maintenanceId={maintenance.id}>
                    {(open) => <Button onPress={open} isIconOnly startContent={<TrashIcon className="w-4 h-4" />} />}
                  </ResourceMaintenanceCancelModal>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardBody>
    </Card>
  );
}
