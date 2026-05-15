import { Button, Card, CardProps, cn, Table, TableBody, TableCell, TableColumn, TableContent, TableHeader, TableRow } from '@heroui/react';
import { PageHeader } from '../../../../components/pageHeader';
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
import { CheckCircleIcon, CogIcon, ConstructionIcon, PlusIcon } from 'lucide-react';
import { useNow } from '../../../../hooks/useNow';
import { EmptyState } from '../../../../components/emptyState';

interface Props {
  resourceId: number;
  variant?: 'card' | 'flat';
}

export function MaintenanceManagement(props: Props & Omit<CardProps, 'children' | 'variant'>) {
  const { resourceId, variant = 'card', ...cardProps } = props;

  const { t } = useTranslations({
    de,
    en,
  });

  const navigate = useNavigate();

  const [includePast, setIncludePast] = useState(false);

  const { data: maintenances } = useResourceMaintenancesServiceFindMaintenances({
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

  const actions = (
    <>
      <Button variant="ghost"
        onPress={() => navigate(`/resources/${resourceId}/maintenance`)}
        data-cy="manage-maintenance-button"
      >
        {t('actions.manageHub.label')}
      </Button>
      <LabeledSwitch isSelected={includePast} onChange={setIncludePast}>
        {t('filters.includePast')}
      </LabeledSwitch>
      <ResourceMaintenanceUpsertModal resourceId={resourceId}>
        {(open) => (
          <Button variant="primary" onPress={open}>
            <PlusIcon className="w-4 h-4" />
            {t('actions.create.label')}
          </Button>
        )}
      </ResourceMaintenanceUpsertModal>
    </>
  );

  const tableContent = (
    <Table>
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
                         
                          onPress={openMarkDone}
                        ><CheckCircleIcon className="w-4 h-4" /></Button>
                      )}
                    </MarkDoneModal>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          </TableContent>
        </Table>
  );

  if (variant === 'flat') {
    return (
      <section className={cn('w-full', (cardProps as { className?: string }).className)}>
        <header className="flex items-center justify-between gap-2 flex-wrap border-b border-divider pb-2 mb-3">
          <div className="flex items-center gap-2 text-foreground-700">
            <ConstructionIcon className="w-4 h-4" />
            <h3 className="text-xs font-semibold uppercase tracking-wider">{t('title')}</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">{actions}</div>
        </header>
        {maintenanceWithStatus.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="text-sm divide-y divide-divider">
            {maintenanceWithStatus.map((maintenance) => (
              <li
                key={maintenance.id}
                className={cn(
                  'flex items-start justify-between gap-3 py-2',
                  maintenance.isActive && 'border-l-4 border-l-warning pl-2',
                  maintenance.isPast && 'line-through opacity-60',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-foreground-700 text-xs">
                    <DateTimeDisplay date={maintenance.startTime} />
                    {maintenance.endTime && (
                      <>
                        {' – '}
                        <DateTimeDisplay date={maintenance.endTime} />
                      </>
                    )}
                  </div>
                  <div className="text-foreground truncate">
                    <MaintenanceReasonDisplay reason={maintenance.reason} />
                  </div>
                </div>
                {maintenance.isActive && (
                  <MarkDoneModal resourceId={resourceId} maintenanceId={maintenance.id}>
                    {(openMarkDone: () => void) => (
                      <Button variant="tertiary" isIconOnly onPress={openMarkDone}>
                        <CheckCircleIcon className="w-4 h-4" />
                      </Button>
                    )}
                  </MarkDoneModal>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <Card {...cardProps}>
      <Card.Header>
        <PageHeader
          title={t('title')}
          icon={<ConstructionIcon />}
          noMargin
          actions={actions}
        />
      </Card.Header>

      <Card.Content>{tableContent}</Card.Content>
    </Card>
  );
}
