import type { Channel } from './configuration-model';
import type { Purpose } from './ChannelWorkspace.purpose';
import type { WagoConfigurationSnapshot } from './api';
import { digitalTerminalLabel } from '../../backend/configuration-digital';
import type { TFunction } from '@attraccess/plugins-frontend-ui';

export function canAddChannel(
  {
    name,
    purpose,
    pulseMs,
    guardId,
    disconnect,
    timeoutMs,
  }: {
    name: string;
    purpose: Purpose;
    pulseMs: number;
    guardId: string;
    disconnect: string;
    timeoutMs: number;
  },
  hasTerminal: boolean,
  inputs: Channel[],
): boolean {
  return (
    hasTerminal &&
    !!name.trim() &&
    name.trim().length <= 120 &&
    (purpose !== 'pulse' || (Number.isInteger(pulseMs) && pulseMs > 0)) &&
    (purpose !== 'guard' || inputs.some((item) => item.id === guardId)) &&
    (purpose === 'input' || disconnect !== 'watchdog' || (Number.isInteger(timeoutMs) && timeoutMs > 0))
  );
}

export function channelAssignment(snapshot: WagoConfigurationSnapshot, channel: Channel, t: TFunction) {
  const point = snapshot.physicalPoints.find((item) => item.id === channel.physicalPointId);
  if (!point) return t('channels.missingAssignment');
  if (point.hardwareProfile === '751-9301') return `CC100 · ${digitalTerminalLabel(point.channel)}`;
  if (point.hardwareProfile === 'modbus')
    return (
      snapshot.modbus?.devices.find((device) => device.id === point.modbus?.deviceId)?.name ??
      t('channels.missingDevice')
    );
  return t('channels.module', { profile: point.hardwareProfile, channel: point.channel });
}
