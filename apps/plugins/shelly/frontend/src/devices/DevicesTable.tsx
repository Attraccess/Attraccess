import { TableActionsColumnHeader, type TFunction } from '@attraccess/plugins-frontend-ui';
import {
  Chip,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { reprobeDevice, type FirmwareOverviewEntry, type ShellyDevice } from '../api';
import { useShellyTranslations } from '../i18n';
import { AuthChip } from './AuthChip';
import { EmptyDevices } from './EmptyDevices';
import { FirmwareCell } from './firmware/FirmwareCell';
import { UpdateAvailableIndicator } from './firmware/UpdateAvailableIndicator';
import { ProbeErrorIndicator } from './ProbeErrorIndicator';
import { RowActions } from './RowActions';

interface DevicesTableProps {
  devices: ShellyDevice[];
  firmware: Record<number, FirmwareOverviewEntry>;
  rowBusyId: number | null;
  onAdd: () => void;
  setInfoDevice: (device: ShellyDevice) => void;
  setFirmwareDevice: (device: ShellyDevice) => void;
  setAuthDevice: (device: ShellyDevice) => void;
  onDelete: (device: ShellyDevice) => Promise<void>;
  withRowBusy: (id: number, action: () => Promise<unknown>) => Promise<void>;
}

type DeviceRowProps = Omit<DevicesTableProps, 'devices' | 'onAdd'>;

function renderDeviceRow(
  device: ShellyDevice,
  { firmware, rowBusyId, setInfoDevice, setFirmwareDevice, setAuthDevice, withRowBusy, onDelete }: DeviceRowProps,
  t: TFunction,
) {
  return (
    <TableRow key={device.id} id={device.id} data-cy={`shelly-device-row-${device.id}`}>
      <TableCell className="sh:whitespace-nowrap">
        <div className="sh:flex sh:items-center sh:gap-1">
          <span
            className="sh:max-w-36 sh:truncate sh:font-medium sh:text-default-800 sh:sm:max-w-48"
            title={device.name}
          >
            {device.name}
          </span>
          {device.lastProbeError && <ProbeErrorIndicator message={device.lastProbeError} />}
          <UpdateAvailableIndicator entry={firmware[device.id]} />
        </div>
        <div className="sh:text-xs sh:text-default-500 sh:sm:hidden sh:md:block sh:lg:hidden">{device.ipAddress}</div>
      </TableCell>
      <TableCell className="sh:hidden sh:whitespace-nowrap sh:text-default-600 sh:sm:table-cell sh:md:hidden sh:lg:table-cell">
        {device.ipAddress}
      </TableCell>
      <TableCell className="sh:hidden sh:whitespace-nowrap sh:lg:table-cell">
        <div className="sh:flex sh:items-center sh:gap-1.5">
          <span className="sh:max-w-36 sh:truncate" title={device.model ?? undefined}>
            {device.model ?? '—'}
          </span>
          <Chip variant="soft" size="sm" className="sh:whitespace-nowrap">
            {device.generation === null
              ? t('devices.unknown')
              : t(device.generation === 1 ? 'devices.generation' : 'devices.generationPlus', {
                  generation: device.generation,
                })}
          </Chip>
        </div>
      </TableCell>
      <TableCell className="sh:hidden sh:whitespace-nowrap sh:sm:table-cell">
        <AuthChip state={device.authState} />
      </TableCell>
      <TableCell className="sh:hidden sh:whitespace-nowrap sh:xl:table-cell">
        <FirmwareCell entry={firmware[device.id]} />
      </TableCell>
      <TableCell className="sh:whitespace-nowrap">
        <RowActions
          device={device}
          isBusy={rowBusyId === device.id}
          onInfo={() => setInfoDevice(device)}
          onFirmware={() => setFirmwareDevice(device)}
          onAuth={() => setAuthDevice(device)}
          onReprobe={() => withRowBusy(device.id, () => reprobeDevice(device.id))}
          onDelete={() => onDelete(device)}
        />
      </TableCell>
    </TableRow>
  );
}

export function DevicesTable({ devices, onAdd, ...rowProps }: DevicesTableProps) {
  const { t, language } = useShellyTranslations();
  const { firmware, rowBusyId } = rowProps;
  return (
    <Table data-cy="shelly-device-table">
      <TableScrollContainer>
        <TableContent aria-label={t('devices.table')}>
          <TableHeader>
            <TableColumn isRowHeader>{t('devices.device')}</TableColumn>
            <TableColumn className="sh:hidden sh:sm:table-cell sh:md:hidden sh:lg:table-cell">
              {t('devices.address')}
            </TableColumn>
            <TableColumn className="sh:hidden sh:lg:table-cell">{t('devices.model')}</TableColumn>
            <TableColumn className="sh:hidden sh:sm:table-cell">{t('devices.auth')}</TableColumn>
            <TableColumn className="sh:hidden sh:xl:table-cell">{t('devices.firmware')}</TableColumn>
            <TableColumn id="actions">
              <TableActionsColumnHeader />
            </TableColumn>
          </TableHeader>
          {/* `dependencies` is required: without it react-aria caches the rendered
              rows, and the row closure keeps the firmware/busy state it was first
              rendered with. */}
          <TableBody
            items={devices}
            dependencies={[firmware, rowBusyId, language]}
            renderEmptyState={() => <EmptyDevices onAdd={onAdd} />}
          >
            {(device) => renderDeviceRow(device, rowProps, t)}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
}
