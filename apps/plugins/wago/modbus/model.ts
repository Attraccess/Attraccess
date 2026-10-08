import ipaddr from 'ipaddr.js';
import type {
  ModbusAction,
  ModbusConfiguration,
  ModbusDevice,
  ModbusMeasurement,
  ModbusProfile,
  RegisterFormat,
} from './model-contracts';
import { ModbusPoint } from './model-contracts';
import { validateConnections } from './validate-connections';
import { validateProfiles } from './validate-profiles';
import { createModbusValidation } from './validation-context';
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

export function findProfile(config: ModbusConfiguration, device: ModbusDevice): ModbusProfile | undefined {
  return [...BUILTIN_MODBUS_PROFILES, ...config.profiles].find(
    (p) => p.id === device.profileId && p.version === device.profileVersion,
  );
}

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

export function duplicateProfile(profile: ModbusProfile, id: string): ModbusProfile {
  return { ...JSON.parse(JSON.stringify(profile)), id, name: `${profile.name} (custom)`, version: 1 };
}

export const registerCount = (format: RegisterFormat): number =>
  ['uint16', 'int16'].includes(format.dataType) ? 1 : 2;

export function wireAddress(format: RegisterFormat): number {
  if (!Number.isSafeInteger(format.address) || ![0, 1].includes(format.addressBase))
    throw new Error('invalid Modbus register address');
  const address = format.address - format.addressBase;
  if (address < 0 || address + registerCount(format) > 65536) throw new Error('invalid Modbus register address');
  return address;
}

export /** Validate one logical owner against the selected profile and the shared physical address space. */
function validateChannelBinding(
  channel: {
    capabilities?: unknown;
    measurement?: { unit?: unknown; kind?: unknown; scale?: unknown; offset?: unknown };
  },
  measurement: ModbusMeasurement | undefined,
  action: ModbusAction | undefined,
  device: ModbusDevice | undefined,
  outputOwners: Set<string>,
  fail: (message: string) => void,
): void {
  const capabilities = Array.isArray(channel.capabilities) ? channel.capabilities : [];
  if (capabilities.includes('output') && action && device) {
    // Connection endpoints are unique in a valid config. Device/profile/action names
    // are aliases, while FC06 and FC16 share the same holding-register address space.
    for (let offset = 0; offset < registerCount(action); offset++) {
      const key = JSON.stringify([
        device.connectionId,
        device.unitId,
        action.functionCode === 5 ? 'coil' : 'register',
        wireAddress(action) + offset,
      ]);
      if (outputOwners.has(key)) fail('each physical Modbus output must have a single logical owner');
      outputOwners.add(key);
    }
  }
  if (capabilities.includes('input') && !capabilities.includes('measurement'))
    fail(
      measurement
        ? 'Modbus register inputs require measurement capability and its named measurement transform'
        : 'input requires named measurement',
    );
  if (capabilities.includes('output') && !action) fail('output requires named action');
  if (
    capabilities.includes('measurement') &&
    (!measurement ||
      channel.measurement?.unit !== measurement.unit ||
      (channel.measurement?.kind ?? 'live') !== measurement.kind ||
      channel.measurement?.scale !== 1 ||
      channel.measurement?.offset !== 0)
  )
    fail('measurement channel must match profile unit/kind with identity transform');
}

// Persisted legacy profiles retain their original IDs, versions and transforms.
// Freeze nested maps: callers must duplicate before editing. Evidence URLs are documented in README.
freeze(BUILTIN_MODBUS_PROFILES);

export function validateModbus(value: unknown): Array<{ path: string; code: string; message: string }> {
  const errors: Array<{ path: string; code: string; message: string }> = [];
  const validation = createModbusValidation(errors);
  const { fail, object, integer, name, keys } = validation;
  if (!object(value)) {
    fail('modbus', 'must be an object');
    return errors;
  }
  keys(value, ['connections', 'devices', 'profiles'], 'modbus');
  const arrays = ['connections', 'devices', 'profiles'] as const;
  for (const key of arrays)
    if (!Array.isArray(value[key]) || value[key].length > 64)
      fail(`modbus.${key}`, 'must be an array with at most 64 entries');
  if (errors.length) return errors;
  const config = value as unknown as ModbusConfiguration;
  for (const key of arrays) {
    const ids = new Set<string>();
    config[key].forEach((entry, i) => {
      if (!object(entry) || !name(entry.id) || ids.has(String(entry.id)))
        fail(`modbus.${key}[${i}]`, 'unique non-empty ID required');
      if (entry && typeof entry.id === 'string') ids.add(entry.id);
    });
  }
  if (errors.length) return errors;
  validateConnections(config, validation);
  validateProfiles(config, validation);
  config.devices.forEach((d, i) => {
    keys(
      d,
      ['id', 'name', 'connectionId', 'unitId', 'profileId', 'profileVersion', 'pollIntervalMs'],
      `modbus.devices[${i}]`,
    );
    if (d.pollIntervalMs !== undefined && !integer(d.pollIntervalMs, 100, 3600000))
      fail(`modbus.devices[${i}].pollIntervalMs`, 'device polling interval must be 100..3600000 ms');
    if (
      !name(d.name) ||
      !integer(d.unitId, 1, 247) ||
      !config.connections.some((c) => c.id === d.connectionId) ||
      !findProfile(config, d)
    )
      fail(`modbus.devices[${i}]`, 'device requires name, unit 1..247, existing connection and exact profile version');
  });
  return errors;
}

/** Same binding validation runs at persistence and runtime acceptance boundaries. */
export function validateModbusBindings(snapshot: {
  modbus?: unknown;
  physicalPoints?: unknown;
  logicalChannels?: unknown;
}): Array<{ path: string; code: string; message: string }> {
  const errors: Array<{ path: string; code: string; message: string }> = [];
  if (!Array.isArray(snapshot.physicalPoints)) return errors;
  const config = snapshot.modbus as ModbusConfiguration | undefined;
  const valid = config && validateModbus(config).length === 0;
  const outputOwners = new Set<string>();
  for (const [i, point] of snapshot.physicalPoints.entries()) {
    if (point?.modbus === undefined) {
      if (point?.hardwareProfile === 'modbus')
        errors.push({
          path: `physicalPoints[${i}].modbus`,
          code: 'invalid_modbus_binding',
          message: 'Modbus points require a device binding',
        });
      continue;
    }
    const path = `physicalPoints[${i}].modbus`;
    const fail = (message: string) => errors.push({ path, code: 'invalid_modbus_binding', message });
    if (!point.modbus || typeof point.modbus !== 'object' || Array.isArray(point.modbus)) {
      fail('binding must be an object');
      continue;
    }
    const binding = point.modbus as ModbusPoint;
    if (!valid) {
      fail('valid Modbus configuration required');
      continue;
    }
    const device = config.devices.find((d) => d.id === binding.deviceId);
    const profile = device && findProfile(config, device);
    if (
      !profile ||
      Object.keys(binding).some((key) => !['deviceId', 'measurementId', 'actionId'].includes(key)) ||
      (!binding.measurementId && !binding.actionId)
    ) {
      fail('existing device and named measurement/action required');
      continue;
    }
    const measurement = profile.measurements.find((m) => m.id === binding.measurementId);
    const action = profile.actions.find((a) => a.id === binding.actionId);
    if (binding.measurementId && !measurement) fail('unknown profile measurement');
    if (binding.actionId && !action) fail('unknown profile action (built-in meters are read-only)');
    if (Array.isArray(snapshot.logicalChannels))
      for (const channel of snapshot.logicalChannels) {
        if (channel?.physicalPointId !== point.id) continue;
        validateChannelBinding(channel, measurement, action, device, outputOwners, fail);
      }
  }
  return errors;
}

export * from './model-contracts';
