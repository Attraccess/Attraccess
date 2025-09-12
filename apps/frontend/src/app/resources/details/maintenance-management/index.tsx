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
import { ResourceMaintenance, useResourceMaintenancesServiceFindMaintenances } from '@attraccess/react-query-client';
import { useMemo, useState } from 'react';
import { DateTimeDisplay, useTranslations } from '@attraccess/plugins-frontend-ui';

import de from './de.json';
import en from './en.json';
import { ResourceMaintenanceUpsertModal } from './upsert';
import { CogIcon, ConstructionIcon, PencilIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { ResourceMaintenanceCancelModal } from './cancel';
import { useNow } from '../../../../hooks/useNow';

interface Props {
  resourceId: number;
}

export function MaintenanceManagement(props: Props & Omit<CardProps, 'children'>) {
  const { resourceId, ...cardProps } = props;

  const { t } = useTranslations({
    de,
    en,
  });

  const [includePast, setIncludePast] = useState(false);

  const { data: maintenances } = useResourceMaintenancesServiceFindMaintenances({
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
        <Table removeWrapper>
          <TableHeader>
            <TableColumn>{t('table.columns.start')}</TableColumn>
            <TableColumn>{t('table.columns.end')}</TableColumn>
            <TableColumn>{t('table.columns.reason')}</TableColumn>
            <TableColumn>
              <CogIcon />
            </TableColumn>
          </TableHeader>
          <TableBody items={maintenanceWithStatus}>
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
                <TableCell className="overflow-hidden text-ellipsis" title={maintenance.reason}>
                  {maintenance.reason}
                </TableCell>
                <TableCell align="right">
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
