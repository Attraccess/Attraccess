import { CC100_SERIAL_PATH } from '../../../shared/hardware-profile';
import { type ModbusConnection } from '../../../modbus/model';
export const DEFAULT_BUS: ModbusConnection = {
  id: 'cc100-rs485',
  transport: 'rtu',
  path: CC100_SERIAL_PATH,
  baudRate: 9600,
  parity: 'even',
  stopBits: 1,
  timeoutMs: 1000,
  reconnectMs: 1000,
  queueLimit: 100,
};
