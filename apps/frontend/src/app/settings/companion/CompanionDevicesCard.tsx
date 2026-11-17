import {
  Card,
  Spinner,
  Table,
  TableBody,
  TableColumn,
  TableContent,
  TableHeader,
  TableScrollContainer,
} from '@heroui/react';
import { EmptyState, useTranslations } from '@attraccess/plugins-frontend-ui';
import { CompanionDevice, useListCompanionDevices, useGetCompanionVersions } from '@attraccess/react-query-client';
import { DeviceRow } from './DeviceRow';
import en from './en.json';
import de from './de.json';

interface CompanionDevicesCardProps {
  onRenameStart: (device: CompanionDevice) => void;
  onDeleteStart: (device: CompanionDevice) => void;
}

export function CompanionDevicesCard({ onRenameStart, onDeleteStart }: CompanionDevicesCardProps) {
  const { t } = useTranslations({ en, de });
  const { data: devices, isLoading: devicesLoading } = useListCompanionDevices({}, undefined, {
    refetchInterval: 30000,
  });
  const { data: manifest } = useGetCompanionVersions();
  return (
    <Card>
      <Card.Header className="flex flex-col items-start gap-1">
        <span className="text-base font-semibold">{t('devices.title')}</span>
        <span className="text-sm text-default-500">{t('devices.subtitle')}</span>
      </Card.Header>
      <Card.Content>
        {devicesLoading ? (
          <div className="flex justify-center py-6">
            <Spinner size="sm" />
          </div>
        ) : (
          <Table>
            <TableScrollContainer>
              <TableContent aria-label={t('devices.title')}>
                <TableHeader>
                  <TableColumn isRowHeader>{t('devices.columns.name')}</TableColumn>
                  <TableColumn>{t('devices.columns.status')}</TableColumn>
                  <TableColumn>{t('devices.columns.lastSeen')}</TableColumn>
                  <TableColumn>{t('devices.columns.version')}</TableColumn>
                  <TableColumn>{t('devices.columns.actions')}</TableColumn>
                </TableHeader>
                <TableBody items={devices ?? []} renderEmptyState={() => <EmptyState />}>
                  {(device) => (
                    <DeviceRow
                      key={device.id}
                      device={device}
                      latestVersion={manifest?.version ?? null}
                      onRenameStart={onRenameStart}
                      onDeleteStart={onDeleteStart}
                    />
                  )}
                </TableBody>
              </TableContent>
            </TableScrollContainer>
          </Table>
        )}
      </Card.Content>
    </Card>
  );
}
