import { findProfile } from '../../modbus/model';
import { type PulseRoute } from './runtime-types';

export function routeKey(route: PulseRoute): string {
  const { point, snapshot } = route;
  if (!point.modbus) return JSON.stringify([point.hardwareProfile, point.channel]);
  const config = snapshot.modbus;
  const device = config?.devices.find((item) => item.id === point.modbus?.deviceId);
  const connection = config?.connections.find((item) => item.id === device?.connectionId);
  const action =
    config && device && findProfile(config, device)?.actions.find((item) => item.id === point.modbus?.actionId);
  const endpoint =
    connection?.transport === 'rtu'
      ? [connection.transport, connection.path, connection.baudRate, connection.parity, connection.stopBits]
      : connection && [connection.transport, connection.host, connection.port];
  return JSON.stringify([
    endpoint,
    device?.unitId,
    action && [
      action.functionCode,
      action.address - action.addressBase,
      action.dataType,
      action.byteOrder,
      action.wordOrder,
      action.scale,
      action.offset,
      action.onValue,
      action.offValue,
    ],
  ]);
}

export const MAX_PENDING_CHANNEL_WRITES = 100;

export const INITIAL_PULSE_SHUTDOWN_RETRY_DELAY_MS = 100;

export const MAX_PULSE_SHUTDOWN_RETRY_DELAY_MS = 5_000;
