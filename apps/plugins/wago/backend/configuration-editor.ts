import {
  applyPreset,
  configurationDiff,
  configurationHash,
  validateSnapshot,
  WAGO_PRESETS,
  type WagoConfigurationSnapshot,
  type WagoPresetApplication,
  type ConfigurationValidationError,
} from './configuration';
import { DIGITAL_TERMINALS } from './configuration-digital';
import { findProfile } from '../modbus/model';

/** Editor-only metadata, stored alongside provenance; never sent to a controller. */
export interface ConfigurationEditorMetadata {
  names: Record<string, string>;
  /** Apply-action history: append on explicit application, preserve during ordinary edits. */
  presets: WagoPresetApplication[];
}

export function editorMetadata(value: unknown): ConfigurationEditorMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('editor metadata must be an object');
  const { names, presets } = value as ConfigurationEditorMetadata;
  if (
    !names ||
    typeof names !== 'object' ||
    Array.isArray(names) ||
    !Object.values(names).every((name) => typeof name === 'string' && name.trim().length > 0 && name.length <= 120)
  )
    throw new Error('channel names must contain 1–120 characters');
  if (
    !Array.isArray(presets) ||
    !presets.every(
      (preset) =>
        preset &&
        WAGO_PRESETS.some((item) => item.id === preset.presetId) &&
        typeof preset.channelId === 'string' &&
        typeof preset.physicalPointId === 'string',
    )
  )
    throw new Error('preset provenance must contain valid preset applications');
  return { names, presets };
}

/** Additional editor safeguards; the version 1 wire model remains unchanged. */
export function validateEditorSnapshot(snapshot: unknown): ConfigurationValidationError[] {
  const errors = validateSnapshot(snapshot);
  if (errors.length) return errors;
  const value = snapshot as WagoConfigurationSnapshot;
  const terminals = new Set<number>();
  const assignedPoints = new Set<string>();
  value.physicalPoints.forEach((point, index) => {
    if (point.hardwareProfile !== '751-9301') return;
    if (!DIGITAL_TERMINALS.some((terminal) => terminal.channel === point.channel))
      errors.push({
        path: `physicalPoints[${index}].channel`,
        code: 'unsupported_terminal',
        message: 'select DO1–DO4 or DI1–DI8',
      });
    if (terminals.has(point.channel))
      errors.push({
        path: `physicalPoints[${index}].channel`,
        code: 'duplicate_terminal',
        message: 'each digital terminal can have only one physical assignment',
      });
    terminals.add(point.channel);
  });
  value.logicalChannels.forEach((channel, index) => {
    const path = `logicalChannels[${index}]`;
    const point = value.physicalPoints.find((point) => point.id === channel.physicalPointId);
    if (point?.hardwareProfile === '751-9301') {
      const terminal = DIGITAL_TERMINALS.find((terminal) => terminal.channel === point.channel);
      if (
        terminal &&
        (!channel.capabilities.includes(terminal.direction) ||
          channel.capabilities.includes(terminal.direction === 'input' ? 'output' : 'input'))
      )
        errors.push({
          path: `${path}.physicalPointId`,
          code: 'direction_mismatch',
          message: `${terminal.label} requires an ${terminal.direction} channel`,
        });
      if (assignedPoints.has(point.id))
        errors.push({
          path: `${path}.physicalPointId`,
          code: 'duplicate_assignment',
          message: 'each digital terminal can be assigned to only one logical channel',
        });
      assignedPoints.add(point.id);
    }
    for (const capability of ['pulse', 'guard', 'feedback'] as const) {
      if (channel.capabilities.includes(capability) && !channel[capability])
        errors.push({
          path: `${path}.${capability}`,
          code: 'required_field',
          message: `configure ${capability} settings for this capability`,
        });
    }
    if (channel.guard) {
      const input = value.logicalChannels.find((item) => item.id === channel.guard?.channelId);
      if (!input || input.id === channel.id || !input.capabilities.includes('input'))
        errors.push({
          path: `${path}.guard.channelId`,
          code: 'invalid_guard_channel',
          message: 'guard must reference a distinct input channel',
        });
    }
  });
  return errors;
}

export function previewConfigurationPreset(snapshot: WagoConfigurationSnapshot, application: WagoPresetApplication) {
  const errors = validateSnapshot(snapshot);
  if (errors.length) throw new Error(errors.map((error) => `${error.path}: ${error.message}`).join('; '));
  const candidate = applyPreset(snapshot, application);
  return {
    draftHash: configurationHash(snapshot),
    snapshot: candidate,
    diff: configurationDiff(snapshot, candidate),
    errors: validateEditorSnapshot(candidate),
  };
}

/** Select only paths produced by this exact preview. Never traverse client-supplied object paths. */
export function selectPresetChanges(
  snapshot: WagoConfigurationSnapshot,
  application: WagoPresetApplication,
  paths: string[],
  expectedHash: string,
) {
  const preview = previewConfigurationPreset(snapshot, application);
  if (expectedHash !== preview.draftHash) throw new Error('draft changed; preview the preset again');
  if (!Array.isArray(paths) || paths.some((path) => !preview.diff.some((change) => change.path === path)))
    throw new Error('unknown preset change');
  const selected = new Set(paths);
  function copy(previous: unknown, current: unknown, path: string): unknown {
    if (selected.has(path)) return current;
    if (Array.isArray(previous) && Array.isArray(current))
      return Array.from({ length: Math.max(previous.length, current.length) }, (_, index) =>
        copy(previous[index], current[index], `${path}[${index}]`),
      ).filter((item) => item !== undefined);
    if (
      previous &&
      current &&
      typeof previous === 'object' &&
      typeof current === 'object' &&
      !Array.isArray(previous) &&
      !Array.isArray(current)
    ) {
      const before = previous as Record<string, unknown>;
      const after = current as Record<string, unknown>;
      return Object.fromEntries(
        [...new Set([...Object.keys(before), ...Object.keys(after)])]
          .map((key) => [key, copy(before[key], after[key], `${path}.${key}`)])
          .filter(([, value]) => value !== undefined),
      );
    }
    return previous;
  }
  const candidate = copy(snapshot, preview.snapshot, '$') as WagoConfigurationSnapshot;
  const errors = validateEditorSnapshot(candidate);
  if (errors.length) throw new Error(errors.map((error) => `${error.path}: ${error.message}`).join('; '));
  return candidate;
}

export function configurationImpacts(previous: WagoConfigurationSnapshot | null, current: WagoConfigurationSnapshot) {
  const behavior = (
    snapshot: WagoConfigurationSnapshot,
    channel: WagoConfigurationSnapshot['logicalChannels'][number],
  ) => {
    const point = snapshot.physicalPoints.find((point) => point.id === channel.physicalPointId);
    const binding = point?.modbus;
    const device = snapshot.modbus?.devices.find((device) => device.id === binding?.deviceId);
    const profile = device && snapshot.modbus ? findProfile(snapshot.modbus, device) : undefined;
    return {
      channel,
      point,
      ...(binding
        ? {
            connection: snapshot.modbus?.connections.find((connection) => connection.id === device?.connectionId),
            device: device && {
              connectionId: device.connectionId,
              unitId: device.unitId,
              profileId: device.profileId,
              profileVersion: device.profileVersion,
            },
            measurement: profile?.measurements.find((measurement) => measurement.id === binding.measurementId),
            action: profile?.actions.find((action) => action.id === binding.actionId),
          }
        : {}),
    };
  };
  return (previous?.logicalChannels ?? []).flatMap((channel) => {
    const next = current.logicalChannels.find((item) => item.id === channel.id);
    if (
      next &&
      previous &&
      configurationHash(behavior(previous, channel)) === configurationHash(behavior(current, next))
    )
      return [];
    return [
      {
        channelId: channel.id,
        message: next
          ? 'Channel behavior or physical assignment changed. Existing flow commands may behave differently.'
          : 'Channel removed. Existing flow references may fail.',
      },
    ];
  });
}
