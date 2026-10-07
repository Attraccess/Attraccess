import { wago8793020Measurements } from './wago-879-3020';
import type { ModbusProfile } from "./model-contracts";
import { legacyProfiles } from "./model.legacy-profiles";
import { base } from "./model.base";

// Persisted legacy profiles retain their original IDs, versions and transforms.
export const BUILTIN_MODBUS_PROFILES: readonly ModbusProfile[] = [
  {
    id: 'wago-879-3020',
    name: 'WAGO 879-3020 (4PS) — Modbus RTU',
    version: 1,
    actions: [],
    measurements: wago8793020Measurements(),
  },
  {
    id: 'wago-879-3000',
    name: 'WAGO 879-3000 — Modbus RTU',
    version: 1,
    actions: [],
    measurements: [
      ...legacyProfiles[0].measurements.map((measurement) => ({ ...measurement, decimalPlaces: 3 })),
      {
        ...base,
        id: 'voltage-l1',
        name: 'L1 voltage',
        address: 0x5002,
        dataType: 'float32',
        scale: 1,
        unit: 'volt',
        kind: 'live',
        decimalPlaces: 3,
      },
      {
        ...base,
        id: 'current-l1',
        name: 'L1 current',
        address: 0x500c,
        dataType: 'float32',
        scale: 1,
        unit: 'ampere',
        kind: 'live',
        decimalPlaces: 3,
      },
    ],
  },
  ...legacyProfiles,
];
