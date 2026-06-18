export {
  openSerial,
  closeSerial,
  waitForSerialMessage,
  sendSerialCommand,
  writeSerialRaw,
  configureDeviceViaSerial,
  getSerialPath,
} from './serial.js';
export type { DeviceConfig } from './serial.js';

export { MockWsServer } from '../mock-server/index.js';
export type { MockWsServerOptions } from '../mock-server/index.js';
