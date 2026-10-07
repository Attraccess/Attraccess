export const faultCodes = new Set([
  'measurement_read_failed',
  'device_write_failed',
  'feedback_mismatch',
  'feedback_read_failed',
  'modbus_read_failed',
  'modbus_rtu_quarantined',
  'digital_read_failed',
]);
export const MAX_CHANNELS = 256;
export const MAX_CONTROLLERS = 256;
export const RETENTION_MS = 15 * 60_000;
