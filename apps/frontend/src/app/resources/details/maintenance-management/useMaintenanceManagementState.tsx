import {
  Button,
  cn,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { PageAction } from '../../../../components/pageHeader';
import { MaintenanceReasonDisplay } from '../../../../components/MaintenanceReasonDisplay';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { ResourceMaintenance, useResourceMaintenancesServiceFindMaintenances } from '@attraccess/react-query-client';
import { useMemo, useState } from 'react';
import { DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useNavigate } from 'react-router-dom';
import de from './de.json';
import en from './en.json';
import { ResourceMaintenanceUpsertModal } from './upsert';
import { MarkDoneModal } from './mark-done';
import { CheckCircleIcon, CogIcon, ExternalLinkIcon, PlusIcon } from 'lucide-react';
import { useNow } from '../../../../hooks/useNow';
import { EmptyState } from '../../../../components/emptyState';
import type { Props } from './index';

export function useMaintenanceManagementState(props: Props) {
  const { resourceId, variant = 'card', className, ...htmlProps } = props;

  const { t } = useTranslations({
    de,
    en,
  });

  const navigate = useNavigate();

  const [includePast, setIncludePast] = useState(false);

  const { data: maintenances } = useResourceMaintenancesServiceFindMaintenances(
    {
      resourceId,
      includePast,
      includeActive: true,
      includeUpcoming: true,
    },
    undefined,
    {
      refetchInterval: 10000,
    },
  );

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

  const cardActions: PageAction[] = [
    {
      key: 'manage-hub',
      label: t('actions.manageHub.label'),
      onPress: () => navigate(`/resources/${resourceId}/maintenance`),
      dataCy: 'manage-maintenance-button',
    },
    {
      key: 'create',
      label: t('actions.create.label'),
      icon: <PlusIcon className="w-4 h-4" />,
      variant: 'primary',
      renderTrigger: (triggerProps) => (
        <ResourceMaintenanceUpsertModal resourceId={resourceId}>
          {(open) => <Button {...triggerProps} onPress={open} />}
        </ResourceMaintenanceUpsertModal>
      ),
    },
  ];

  const flatActions = (
    <>
      <Button
        variant="ghost"
        size="sm"
        isIconOnly
        onPress={() => navigate(`/resources/${resourceId}/maintenance`)}
        data-cy="manage-maintenance-button"
        aria-label={t('actions.manageHub.label')}
      >
        <ExternalLinkIcon className="w-4 h-4" />
      </Button>
      <LabeledSwitch isSelected={includePast} onChange={setIncludePast}>
        {t('filters.includePast')}
      </LabeledSwitch>
      <ResourceMaintenanceUpsertModal resourceId={resourceId}>
        {(open) => (
          <Button variant="primary" size="sm" isIconOnly onPress={open} aria-label={t('actions.create.label')}>
            <PlusIcon className="w-4 h-4" />
          </Button>
        )}
      </ResourceMaintenanceUpsertModal>
    </>
  );

  const includePastSwitch = (
    <div className="flex justify-end px-4 py-2 border-b border-divider">
      <LabeledSwitch isSelected={includePast} onChange={setIncludePast}>
        {t('filters.includePast')}
      </LabeledSwitch>
    </div>
  );

  const tableContent = (
    <Table>
      <TableScrollContainer>
        <TableContent aria-label={t('table.ariaLabel')}>
          <TableHeader>
            <TableColumn isRowHeader>{t('table.columns.start')}</TableColumn>
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
                <TableCell className="overflow-hidden text-ellipsis">
                  <MaintenanceReasonDisplay reason={maintenance.reason} />
                </TableCell>
                <TableCell>
                  {(maintenance.createdByUser as { username?: string } | undefined)?.username ?? '—'}
                </TableCell>
                <TableCell>
                  {(maintenance.completedByUser as { username?: string } | undefined)?.username ?? '—'}
                </TableCell>
                <TableCell>
                  {maintenance.completedAt ? <DateTimeDisplay date={maintenance.completedAt} /> : '—'}
                </TableCell>
                <TableCell>
                  {maintenance.isActive && (
                    <MarkDoneModal resourceId={resourceId} maintenanceId={maintenance.id}>
                      {(openMarkDone: () => void) => (
                        <Button variant="tertiary" isIconOnly onPress={openMarkDone}>
                          <CheckCircleIcon className="w-4 h-4" />
                        </Button>
                      )}
                    </MarkDoneModal>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
  return {
    resourceId,
    variant,
    className,
    htmlProps,
    t,
    maintenanceWithStatus,
    cardActions,
    flatActions,
    includePastSwitch,
    tableContent,
  } as const;
}
