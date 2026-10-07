import { Chip, TableCell, TableRow } from '@heroui/react';
import { FirmwareCell, UpdateAvailableIndicator } from './FirmwareDrawer';
import { reprobeDevice } from './api';
import { AuthChip } from './DevicesPage.helpers';
import { ProbeErrorIndicator } from './DevicesPage.helpers';
import { RowActions } from './DevicesPage.helpers';
import { useDevicesPageState } from './useDevicesPageState';
type Model = ReturnType<typeof useDevicesPageState>;
type Props = Pick<
  Model,
  | 'firmware'
  | 't'
  | 'rowBusyId'
  | 'setInfoDevice'
  | 'setFirmwareDevice'
  | 'setAuthDevice'
  | 'withRowBusy'
  | 'setDeleteTarget'
>;
export function renderDevicesPageDevicesRows(
  device: NonNullable<Model['devices']>[number],
  { firmware, t, rowBusyId, setInfoDevice, setFirmwareDevice, setAuthDevice, withRowBusy, setDeleteTarget }: Props,
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
          deviceId={device.id}
          isBusy={rowBusyId === device.id}
          onInfo={() => setInfoDevice(device)}
          onFirmware={() => setFirmwareDevice(device)}
          onAuth={() => setAuthDevice(device)}
          onReprobe={() => withRowBusy(device.id, () => reprobeDevice(device.id))}
          onDelete={() => setDeleteTarget(device)}
        />
      </TableCell>
    </TableRow>
  );
}
