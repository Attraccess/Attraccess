import { Button, Card, cn, Table, TableBody, TableCell, TableColumn, TableContent, TableHeader, TableRow } from '@heroui/react';
import { PageHeader } from '../../../../components/pageHeader';
import { MaintenanceReasonDisplay } from '../../../../components/MaintenanceReasonDisplay';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { ResourceMaintenance, useResourceMaintenancesServiceFindMaintenances } from '@attraccess/react-query-client';
import { HTMLAttributes, useMemo, useState } from 'react';
import { DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useNavigate } from 'react-router-dom';

import de from './de.json';
import en from './en.json';
import { ResourceMaintenanceUpsertModal } from './upsert';
import { MarkDoneModal } from './mark-done';
import { CheckCircleIcon, CogIcon, ConstructionIcon, ExternalLinkIcon, PlusIcon } from 'lucide-react';
import { useNow } from '../../../../hooks/useNow';
import { EmptyState } from '../../../../components/emptyState';
import { FlatSection } from '../../../../components/flatSection';

interface Props extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  resourceId: number;
  variant?: 'card' | 'flat';
}

export function MaintenanceManagement(props: Props) {
  const { resourceId, variant = 'card', className, ...htmlProps } = props;

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
          <Button
            variant="primary"
            size="sm"
            isIconOnly
            onPress={open}
            aria-label={t('actions.create.label')}
          >
            <PlusIcon className="w-4 h-4" />
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
      <FlatSection
        icon={<ConstructionIcon className="w-4 h-4" />}
        title={t('title')}
        actions={flatActions}
        className={className}
        {...htmlProps}
      >
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
                  <div className="text-foreground-700 text-xs whitespace-nowrap overflow-hidden text-ellipsis">
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
      </FlatSection>
    );
  }

  return (
    <Card className={className} {...htmlProps}>
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
