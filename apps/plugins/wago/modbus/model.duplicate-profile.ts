import type { ModbusProfile } from "./model-contracts";

export function duplicateProfile(profile: ModbusProfile, id: string): ModbusProfile {
  return { ...JSON.parse(JSON.stringify(profile)), id, name: `${profile.name} (custom)`, version: 1 };
}
