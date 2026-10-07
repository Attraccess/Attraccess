import type { ModbusConfiguration } from "./model-contracts";
import type { ModbusDevice } from "./model-contracts";
import type { ModbusProfile } from "./model-contracts";
import { BUILTIN_MODBUS_PROFILES } from "./model.builtin-modbus-profiles";

export function findProfile(config: ModbusConfiguration, device: ModbusDevice): ModbusProfile | undefined {
  return [...BUILTIN_MODBUS_PROFILES, ...config.profiles].find(
    (p) => p.id === device.profileId && p.version === device.profileVersion,
  );
}
