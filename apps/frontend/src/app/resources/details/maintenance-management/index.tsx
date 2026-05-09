import {
  Button,
  Card,
  CardContent,
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
import { MaintenanceReasonDisplay, useFormattedMaintenanceReason } from '../../../../components/MaintenanceReasonDisplay';
import { ResourceMaintenance, useResourceMaintenancesServiceFindMaintenances } from '@attraccess/react-query-client';
import { useMemo, useState } from 'react';
import { DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';

import de from './de.json';
import en from './en.json';
import { ResourceMaintenanceUpsertModal } from './upsert';
import { MarkDoneModal } from './mark-done';
import { CheckCircleIcon, CogIcon, ConstructionIcon, PlusIcon } from 'lucide-react';
import { useNow } from '../../../../hooks/useNow';
import { EmptyState } from '../../../../components/emptyState';

interface Props {
  resourceId: number;
}

export function MaintenanceManagement(props: Props & Omit<CardProps, 'children'>) {
  const { resourceId, ...cardProps } = props;

  const { t } = useTranslations({
    de,
    en,
  });

  const formatReason = useFormattedMaintenanceReason({});

  const [includePast, setIncludePast] = useState(false);

  const { data: maintenances, status: fetchStatus } = useResourceMaintenancesServiceFindMaintenances({
    resourceId,
    includePast,
    includeActive: true,
    includeUpcoming: true,
  }, undefined, {
    refetchInterval: 10000,
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
                  <Button variant="primary"
                    onPress={open}
                    size="sm"
                    title={t('actions.create.title')}
                  ><PlusIcon className="w-4 h-4" />
                    {t('actions.create.label')}
                  </Button>
                )}
              </ResourceMaintenanceUpsertModal>
            </>
          }
        />
      </CardHeader>

      <CardContent>
        <Table aria-label={t('table.ariaLabel')}>
          <TableHeader>
            <TableColumn>{t('table.columns.start')}</TableColumn>
            <TableColumn>{t('table.columns.end')}</TableColumn>
            <TableColumn>{t('table.columns.reason')}</TableColumn>
            <TableColumn>{t('table.columns.createdBy')}</TableColumn>
            <TableColumn>{t('table.columns.completedBy')}</TableColumn>
            <TableColumn>{t('table.columns.completedAt')}</TableColumn>
            <TableColumn>
              <CogIcon />
            </TableColumn>
          </TableHeader>
          <TableBody items={maintenanceWithStatus} renderEmptyState={() => <EmptyState />}>
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
                  <MaintenanceReasonDisplay reason={maintenance.reason} />
                </TableCell>
                <TableCell title={(maintenance.createdByUser as { username?: string } | undefined)?.username ?? ''}>
                  {(maintenance.createdByUser as { username?: string } | undefined)?.username ?? '—'}
                </TableCell>
                <TableCell title={(maintenance.completedByUser as { username?: string } | undefined)?.username ?? ''}>
                  {(maintenance.completedByUser as { username?: string } | undefined)?.username ?? '—'}
                </TableCell>
                <TableCell>
                  {maintenance.completedAt ? (
                    <DateTimeDisplay date={maintenance.completedAt} />
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>
                  {maintenance.isActive && (
                    <MarkDoneModal resourceId={resourceId} maintenanceId={maintenance.id}>
                      {(openMarkDone: () => void) => (
                        <Button variant="tertiary"
                          isIconOnly
                          title={t('actions.markDone.title')}
                          onPress={openMarkDone}
                        />
                      )}
                    </MarkDoneModal>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
