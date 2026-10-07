import { BUILTIN_MODBUS_PROFILES } from './model.builtin-modbus-profiles';
import { findProfile } from './model.find-profile';
import { freeze } from './model.freeze';
import { ModbusConfiguration } from './model-contracts';
import { ModbusPoint } from './model-contracts';
import { validateChannelBinding } from './model.validate-channel-binding';
import { validateConnections } from './validate-connections';
import { validateProfiles } from './validate-profiles';
import { createModbusValidation } from './validation-context';

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

export { BUILTIN_MODBUS_PROFILES } from './model.builtin-modbus-profiles';
export { duplicateProfile } from './model.duplicate-profile';
export { findProfile } from './model.find-profile';
export { modbusHostIdentity } from './model.modbus-host-identity';
export { registerCount } from './model.register-count';
export { wireAddress } from './model.wire-address';

export * from './model-contracts';
