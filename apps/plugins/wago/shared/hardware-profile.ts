/** Versioned, installer-owned hardware contracts. Legacy releases retain digital-only access. */
export const CC100_DIGITAL_PROFILE_ID = 'cc100-751-9301-fw31-digital-v1';
export const CC100_MODBUS_PROFILE_ID = 'cc100-751-9301-fw31-digital-rtu-v1';
export const CC100_SERIAL_PATH = '/dev/serial';
export const CC100_SERIAL_HOST_PATH = '/dev/ttySTM1';
export type Cc100HardwareProfile = typeof CC100_DIGITAL_PROFILE_ID | typeof CC100_MODBUS_PROFILE_ID;

export function isCc100HardwareProfile(value: unknown): value is Cc100HardwareProfile {
  return value === CC100_DIGITAL_PROFILE_ID || value === CC100_MODBUS_PROFILE_ID;
}
