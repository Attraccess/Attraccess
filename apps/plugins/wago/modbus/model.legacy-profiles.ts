import type { ModbusProfile } from "./model-contracts";
import { base } from "./model.base";
import type { ModbusMeasurement } from "./model-contracts";

export const legacyProfiles: ModbusProfile[] = ['879-3000', '879-1300'].map((model) => ({
  id: `wago-${model}-unverified`,
  name: `WAGO ${model} — UNQUALIFIED / map unverified`,
  version: 1,
  actions: [],
  measurements: [
    {
      ...base,
      id: 'active-power',
      name: 'Active power',
      address: 0x5012,
      dataType: 'float32',
      scale: 1000,
      unit: 'watt',
      kind: 'live',
    },
    ...[
      { id: 'import-energy', name: 'Imported energy', address: 0x600c },
      { id: 'export-energy', name: 'Exported energy', address: 0x6018 },
    ].map((entry): ModbusMeasurement => ({
      ...base,
      ...entry,
      dataType: model === '879-3000' ? 'float32' : 'uint32',
      scale: model === '879-3000' ? 1000 : 1,
      unit: 'watt-hour',
      kind: 'cumulative',
    })),
  ],
}));
