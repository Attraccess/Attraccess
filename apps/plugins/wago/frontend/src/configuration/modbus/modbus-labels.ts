import { BUILTIN_MODBUS_PROFILES, type ModbusProfile } from '../../../../modbus/model';

/** Only catalog-owned names are translated; custom profile and signal names are user data. */
export function modbusDisplayName(profile: ModbusProfile, name: string, translate: (message: string) => string) {
  return BUILTIN_MODBUS_PROFILES.includes(profile) ? translate(name) : name;
}
