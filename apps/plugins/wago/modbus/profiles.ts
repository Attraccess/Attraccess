import ipaddr from 'ipaddr.js';
import type { ModbusMeasurement, ModbusProfile, RegisterFormat } from './model-contracts';
import { wago8793020Measurements } from './wago-879-3020';

export const base = {
  addressBase: 0,
  byteOrder: 'big',
  wordOrder: 'big',
  offset: 0,
  pollIntervalMs: 5000,
  functionCode: 3,
} as const;

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

/** Pure numeric normalization, shared by validation and runtime bus ownership. No DNS lookup. */
export function modbusHostIdentity(host: string): string {
  if (ipaddr.isValid(host)) {
    const address = ipaddr.parse(host);
    if (address.kind() === 'ipv6') {
      const ipv6 = address as ipaddr.IPv6;
      if (ipv6.isIPv4MappedAddress() && !ipv6.zoneId) return ipv6.toIPv4Address().toString();
    }
    return address.toNormalizedString();
  }
  return host.toLowerCase();
}

export // Freeze nested maps: callers must duplicate before editing. Evidence URLs are documented in README.
function freeze(value: object): void {
  Object.values(value).forEach((child) => {
    if (child && typeof child === 'object') freeze(child);
  });
  Object.freeze(value);
}

export const registerCount = (format: RegisterFormat): number =>
  ['uint16', 'int16'].includes(format.dataType) ? 1 : 2;

// Persisted legacy profiles retain their original IDs, versions and transforms.
// Freeze nested maps: callers must duplicate before editing. Evidence URLs are documented in README.
freeze(BUILTIN_MODBUS_PROFILES);
