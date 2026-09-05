/** Persisted engineering units, never wire milli-units. No hardware is qualified by this model. */
export type ModbusConnection = { id: string; timeoutMs: number; reconnectMs: number; queueLimit: number } & (
  | { transport: 'tcp'; host: string; port: number }
  | { transport: 'rtu'; path: string; baudRate: number; parity: 'none' | 'even' | 'odd'; stopBits: 1 | 2 }
);
export type RegisterFormat = {
  address: number;
  addressBase: 0 | 1;
  dataType: 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32';
  byteOrder: 'big' | 'little';
  wordOrder: 'big' | 'little';
  scale: number;
  offset: number;
};
export type ModbusMeasurement = RegisterFormat & {
  id: string;
  name: string;
  functionCode: 3 | 4;
  unit: 'ampere' | 'volt' | 'watt' | 'watt-hour' | 'percent';
  kind: 'live' | 'cumulative';
  pollIntervalMs: number;
  /** Explicit raw counter modulus; absent means decreases fault. Never inferred from dtype. */
  rollover?: number;
};
export type ModbusAction = RegisterFormat & {
  id: string;
  name: string;
  functionCode: 5 | 6 | 16;
  onValue: number;
  offValue: number;
};
export type ModbusProfile = {
  id: string;
  name: string;
  version: number;
  measurements: ModbusMeasurement[];
  actions: ModbusAction[];
};
export type ModbusDevice = {
  id: string;
  name: string;
  connectionId: string;
  unitId: number;
  profileId: string;
  profileVersion: number;
};
export type ModbusConfiguration = {
  connections: ModbusConnection[];
  devices: ModbusDevice[];
  profiles: ModbusProfile[];
};
export type ModbusPoint = { deviceId: string; measurementId?: string; actionId?: string };
export const registerCount = (format: RegisterFormat): number =>
  ['uint16', 'int16'].includes(format.dataType) ? 1 : 2;
export function wireAddress(format: RegisterFormat): number {
  if (!Number.isSafeInteger(format.address) || ![0, 1].includes(format.addressBase))
    throw new Error('invalid Modbus register address');
  const address = format.address - format.addressBase;
  if (address < 0 || address + registerCount(format) > 65536) throw new Error('invalid Modbus register address');
  return address;
}

const base = {
  addressBase: 0,
  byteOrder: 'big',
  wordOrder: 'big',
  offset: 0,
  pollIntervalMs: 5000,
  functionCode: 3,
} as const;
export const BUILTIN_MODBUS_PROFILES: readonly ModbusProfile[] = ['879-3000', '879-1300'].map((model) => ({
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
// Freeze nested maps: callers must duplicate before editing. Evidence URLs are documented in README.
function freeze(value: object): void {
  Object.values(value).forEach((child) => {
    if (child && typeof child === 'object') freeze(child);
  });
  Object.freeze(value);
}
freeze(BUILTIN_MODBUS_PROFILES);
export function findProfile(config: ModbusConfiguration, device: ModbusDevice): ModbusProfile | undefined {
  return [...BUILTIN_MODBUS_PROFILES, ...config.profiles].find(
    (p) => p.id === device.profileId && p.version === device.profileVersion,
  );
}
export function duplicateProfile(profile: ModbusProfile, id: string): ModbusProfile {
  return { ...JSON.parse(JSON.stringify(profile)), id, name: `${profile.name} (custom)`, version: 1 };
}

export function validateModbus(value: unknown): Array<{ path: string; code: string; message: string }> {
  const errors: Array<{ path: string; code: string; message: string }> = [];
  const fail = (path: string, message: string) => errors.push({ path, code: 'invalid_modbus', message });
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const integer = (v: unknown, min: number, max: number) =>
    Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
  const name = (v: unknown) => typeof v === 'string' && !!v.trim() && v.length <= 160;
  const keys = (v: object, allowed: string[], path: string) => {
    for (const key of Object.keys(v)) if (!allowed.includes(key)) fail(`${path}.${key}`, 'unknown field');
  };
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
  const endpoints = new Set<string>();
  config.connections.forEach((c, i) => {
    const path = `modbus.connections[${i}]`;
    keys(
      c,
      [
        'id',
        'timeoutMs',
        'reconnectMs',
        'queueLimit',
        ...(c.transport === 'tcp'
          ? ['transport', 'host', 'port']
          : ['transport', 'path', 'baudRate', 'parity', 'stopBits']),
      ],
      path,
    );
    if (!integer(c.timeoutMs, 10, 60000) || !integer(c.reconnectMs, 0, 60000) || !integer(c.queueLimit, 1, 128))
      fail(path, 'timeout 10..60000ms, reconnect 0..60000ms, queue limit 1..128 required');
    let endpoint: string;
    if (c.transport === 'tcp') {
      if (!name(c.host) || /[\s/]/.test(c.host) || !integer(c.port, 1, 65535))
        return void fail(path, 'TCP host and port 1..65535 required');
      endpoint = `tcp:${c.host.toLowerCase()}:${c.port}`;
    } else if (c.transport === 'rtu') {
      if (
        typeof c.path !== 'string' ||
        !/^\/dev\/[a-zA-Z0-9_./-]+$/.test(c.path) ||
        c.path.includes('..') ||
        c.path
          .split('/')
          .slice(2)
          .some((segment) => segment === '' || segment === '.') ||
        ![1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].includes(c.baudRate) ||
        !['none', 'even', 'odd'].includes(c.parity) ||
        ![1, 2].includes(c.stopBits)
      )
        return void fail(path, 'canonical serial device path, valid baud, parity and stop bits required');
      endpoint = `rtu:${c.path}`;
    } else return void fail(path, 'transport must be tcp or rtu');
    if (endpoints.has(endpoint)) fail(path, 'share one connection for devices on the same endpoint');
    endpoints.add(endpoint);
  });
  const format = (f: RegisterFormat, path: string) => {
    if (
      ![0, 1].includes(f.addressBase) ||
      !Number.isSafeInteger(f.address) ||
      !integer(f.address - f.addressBase, 0, 65536 - registerCount(f)) ||
      !['uint16', 'int16', 'uint32', 'int32', 'float32'].includes(f.dataType) ||
      !['big', 'little'].includes(f.byteOrder) ||
      !['big', 'little'].includes(f.wordOrder) ||
      !Number.isFinite(f.scale) ||
      f.scale === 0 ||
      !Number.isFinite(f.offset)
    )
      fail(path, 'invalid address, dtype, order or transform');
  };
  config.profiles.forEach((p, i) => {
    const path = `modbus.profiles[${i}]`;
    keys(p, ['id', 'name', 'version', 'measurements', 'actions'], path);
    if (BUILTIN_MODBUS_PROFILES.some((b) => b.id === p.id) || !name(p.name) || !integer(p.version, 1, 1000000))
      fail(path, 'custom ID, name and positive version required; built-ins are immutable');
    if (!Array.isArray(p.measurements) || !Array.isArray(p.actions) || p.measurements.length + p.actions.length > 128) {
      fail(path, 'measurements/actions arrays required, maximum 128 entries');
      return;
    }
    const ids = new Set<string>();
    [...p.measurements, ...p.actions].forEach((f, j) => {
      if (!object(f) || !name(f.id) || !name(f.name) || ids.has(f.id)) {
        fail(`${path}[${j}]`, 'unique named entry required');
        return;
      }
      ids.add(f.id);
      format(f, `${path}.${f.id}`);
      keys(
        f,
        [
          'id',
          'name',
          'address',
          'addressBase',
          'dataType',
          'byteOrder',
          'wordOrder',
          'scale',
          'offset',
          'functionCode',
          ...(p.measurements.includes(f as ModbusMeasurement)
            ? ['unit', 'kind', 'pollIntervalMs', 'rollover']
            : ['onValue', 'offValue']),
        ],
        `${path}.${f.id}`,
      );
    });
    p.measurements.forEach((m) => {
      if (
        !m ||
        ![3, 4].includes(m.functionCode) ||
        !['ampere', 'volt', 'watt', 'watt-hour', 'percent'].includes(m.unit) ||
        !['live', 'cumulative'].includes(m.kind) ||
        !integer(m.pollIntervalMs, 100, 3600000)
      )
        fail(path, 'measurement requires FC03/04, physical unit, kind, poll interval 100..3600000ms');
      if (m?.rollover !== undefined && (m.kind !== 'cumulative' || !Number.isFinite(m.rollover) || m.rollover <= 0))
        fail(path, 'rollover must be an explicit positive raw modulus on cumulative measurements');
      if (m?.kind === 'cumulative' && m.scale <= 0) fail(path, 'cumulative measurements require a positive scale');
    });
    p.actions.forEach((a) => {
      if (!a || ![5, 6, 16].includes(a.functionCode) || !Number.isFinite(a.onValue) || !Number.isFinite(a.offValue)) {
        fail(path, 'action requires FC05/06/16 and finite on/off values');
        return;
      }
      if (
        a.functionCode === 5 &&
        (a.dataType !== 'uint16' ||
          a.scale !== 1 ||
          a.offset !== 0 ||
          ![0, 1].includes(a.onValue) ||
          ![0, 1].includes(a.offValue))
      )
        fail(path, 'coil action requires identity uint16 and values 0 or 1');
      if (a.functionCode === 6 && registerCount(a) !== 1) fail(path, 'FC06 requires a 16-bit dtype');
      for (const value of [a.onValue, a.offValue]) {
        const raw = (value - a.offset) / a.scale;
        const limits = {
          uint16: [0, 65535],
          int16: [-32768, 32767],
          uint32: [0, 4294967295],
          int32: [-2147483648, 2147483647],
          float32: [-3.4028234663852886e38, 3.4028234663852886e38],
        }[a.dataType];
        if (
          !limits ||
          !Number.isFinite(raw) ||
          raw < limits[0] ||
          raw > limits[1] ||
          (a.dataType !== 'float32' && !Number.isSafeInteger(raw))
        )
          fail(path, 'action on/off value cannot be represented by dtype and transform');
      }
    });
  });
  config.devices.forEach((d, i) => {
    keys(d, ['id', 'name', 'connectionId', 'unitId', 'profileId', 'profileVersion'], `modbus.devices[${i}]`);
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
        const capabilities = Array.isArray(channel.capabilities) ? channel.capabilities : [];
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
  }
  return errors;
}
