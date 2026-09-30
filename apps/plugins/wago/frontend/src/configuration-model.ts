import { randomUUID } from './configuration-id';
import { BUILTIN_MODBUS_PROFILES, findProfile } from '../../modbus/model';
import type { ModbusConfiguration, ModbusProfile } from '../../modbus/model';
import type { ConfigurationDiff, ConfigurationEditorMetadata, WagoConfigurationSnapshot } from './api';
import { availableDigitalTerminals, digitalTerminalLabel } from '../../backend/configuration-digital';
import type { TFunction } from '@attraccess/plugins-frontend-ui';
import englishFields from './fields.en.json';
import englishChannels from './channels.en.json';
import englishModbus from './modbus.en.json';
import englishPresets from './presets.en.json';
import { modbusDisplayName } from './modbus-labels';

export type Channel = WagoConfigurationSnapshot['logicalChannels'][number];
export type PhysicalPoint = WagoConfigurationSnapshot['physicalPoints'][number];
export const emptyConfiguration: WagoConfigurationSnapshot = { version: 1, physicalPoints: [], logicalChannels: [] };
export const emptyMetadata: ConfigurationEditorMetadata = { names: {}, presets: [] };

export function metadataForSnapshot(
  snapshot: WagoConfigurationSnapshot,
  metadata: ConfigurationEditorMetadata,
): ConfigurationEditorMetadata {
  const retainedIds = new Set([...snapshot.logicalChannels, ...snapshot.physicalPoints].map((item) => item.id));
  return {
    ...metadata,
    names: Object.fromEntries(
      Object.entries(metadata.names).filter(
        ([id, name]) => retainedIds.has(id) || (name.trim().length > 0 && name.length <= 120),
      ),
    ),
  };
}

export function readMetadata(provenance: string | null): ConfigurationEditorMetadata {
  if (!provenance) return emptyMetadata;
  try {
    const parsed = JSON.parse(provenance).editor;
    if (
      parsed &&
      typeof parsed.names === 'object' &&
      parsed.names &&
      !Array.isArray(parsed.names) &&
      Object.values(parsed.names).every((name) => typeof name === 'string') &&
      Array.isArray(parsed.presets)
    )
      return parsed;
  } catch {
    /* Older drafts may not have editor metadata. */
  }
  return emptyMetadata;
}

export function addDigitalChannel(
  snapshot: WagoConfigurationSnapshot,
  direction: 'input' | 'output',
  newId: () => string = () => randomUUID(),
): { snapshot: WagoConfigurationSnapshot; channel: Channel; point: PhysicalPoint } {
  const terminal = availableDigitalTerminals(snapshot, direction)[0];
  if (!terminal) throw new Error(`All digital ${direction} terminals are assigned.`);
  const point: PhysicalPoint = { id: `point-${newId()}`, hardwareProfile: '751-9301', channel: terminal.channel };
  const channel: Channel = {
    id: `channel-${newId()}`,
    physicalPointId: point.id,
    profile: direction === 'input' ? 'generic-monitored-input' : 'generic-digital-output',
    capabilities: [direction],
    disconnectPolicy: { mode: direction === 'input' ? 'hold' : 'immediate' },
  };
  return {
    snapshot: {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, point],
      logicalChannels: [...snapshot.logicalChannels, channel],
    },
    channel,
    point,
  };
}

export function pointLabel(point: PhysicalPoint, names: Record<string, string>, t?: TFunction) {
  return point.hardwareProfile === '751-9301'
    ? `${names[point.id] ?? 'CC100'} · ${digitalTerminalLabel(point.channel)}`
    : t
      ? t('fields.externalAssignment', { name: names[point.id] ?? point.id, profile: point.hardwareProfile })
      : `${names[point.id] ?? point.id} · external assignment (${point.hardwareProfile})`;
}

export function presetDisplayName(profile: string, t?: TFunction): string {
  if (!Object.hasOwn(englishPresets.items, profile)) return profile;
  return t
    ? t(`presets.items.${profile}.name`)
    : englishPresets.items[profile as keyof typeof englishPresets.items].name;
}

type ValueContext = {
  modbus?: ModbusConfiguration;
  profile?: ModbusProfile;
  translateName: (name: string) => string;
  metadataNames: Record<string, string>;
};

function profileForDevice(modbus: ModbusConfiguration | undefined, deviceId: string) {
  const device = modbus?.devices.find((item) => item.id === deviceId);
  return modbus && device ? findProfile(modbus, device) : undefined;
}

export function readableValue(
  value: unknown,
  names: Record<string, string>,
  t?: TFunction,
  field = '',
  context?: ValueContext,
): string {
  if (value === undefined || value === null) return t ? t('fields.notConfigured') : 'Not configured';
  if (Array.isArray(value))
    return (
      value.map((item) => readableValue(item, names, t, field, context)).join(', ') || (t ? t('fields.none') : 'None')
    );
  if (typeof value === 'object') {
    if (
      context &&
      'hardwareProfile' in value &&
      'modbus' in value &&
      value.modbus &&
      typeof value.modbus === 'object' &&
      'deviceId' in value.modbus &&
      typeof value.modbus.deviceId === 'string'
    )
      context = { ...context, profile: profileForDevice(context.modbus, value.modbus.deviceId) };
    if (
      'hardwareProfile' in value &&
      value.hardwareProfile === '751-9301' &&
      'channel' in value &&
      typeof value.channel === 'number'
    ) {
      const name = 'id' in value && typeof value.id === 'string' ? names[value.id] : undefined;
      return `${name ? `${name}: ` : ''}CC100 ${digitalTerminalLabel(value.channel)}`;
    }
    return Object.entries(value)
      .map(
        ([key, item]) =>
          `${fieldLabel(field ? `${field}.${key}` : key, t) ?? (key === 'id' ? (t ? t('fields.name') : 'Name') : words(key))}: ${['name', 'host', 'path'].includes(key) && typeof item === 'string' ? item : readableValue(item, names, t, key, context)}`,
      )
      .join('; ');
  }
  if (typeof value === 'string') {
    if (context && (field === 'measurementId' || field === 'actionId')) {
      if (context.metadataNames[value]) return context.metadataNames[value];
      const entries = field === 'measurementId' ? context.profile?.measurements : context.profile?.actions;
      const entry = entries?.find((item) => item.id === value);
      return entry && context.profile ? modbusDisplayName(context.profile, entry.name, context.translateName) : value;
    }
    if (names[value]) return names[value];
    // Only localize application-defined choices, never identifiers or user text.
    if (field === 'profile') return presetDisplayName(value, t);
    const choiceCatalog = ['unit', 'kind', 'parity', 'byteOrder', 'wordOrder'].includes(field)
      ? { prefix: 'modbus.options', values: englishModbus.options }
      : field === 'mode' || field === 'expected'
        ? { prefix: 'channels', values: englishChannels }
        : field === 'capabilities' || field === 'when'
          ? { prefix: 'fields.values', values: englishFields.values }
          : undefined;
    if (choiceCatalog && Object.hasOwn(choiceCatalog.values, value)) {
      const fallback = choiceCatalog.values[value as keyof typeof choiceCatalog.values];
      if (typeof fallback === 'string') return t ? t(`${choiceCatalog.prefix}.${value}`) : fallback;
    }
    return value;
  }
  return String(value);
}

export function readableChangeValue(
  path: string,
  value: unknown,
  snapshot: WagoConfigurationSnapshot | null,
  names: Record<string, string>,
  t?: TFunction,
  options?: Pick<ValueContext, 'translateName' | 'metadataNames'>,
) {
  if (/\.(name|host|path)$/.test(path) && typeof value === 'string') return value;
  const point = path.match(/^(?:\$\.)?physicalPoints\[(\d+)\]\.channel$/);
  if (point && typeof value === 'number' && snapshot?.physicalPoints[Number(point[1])]?.hardwareProfile === '751-9301')
    return `CC100 ${digitalTerminalLabel(value)}`;
  const context: ValueContext = {
    modbus: snapshot?.modbus,
    translateName: options?.translateName ?? ((name) => name),
    metadataNames: options?.metadataNames ?? names,
  };
  const pointPath = path.match(/^(?:\$\.)?physicalPoints\[(?:(\d+)|id:([^\]]*))\]/);
  const physicalPoint =
    pointPath &&
    (pointPath[1] !== undefined
      ? snapshot?.physicalPoints[Number(pointPath[1])]
      : snapshot?.physicalPoints.find((item) => item.id === decodeURIComponent(pointPath[2])));
  if (physicalPoint?.modbus) context.profile = profileForDevice(context.modbus, physicalPoint.modbus.deviceId);
  const field =
    path
      .split('.')
      .at(-1)
      ?.replace(/\[\d+\]$/, '') ?? '';
  return readableValue(value, names, t, field, context);
}

function words(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('-', ' ')
    .replaceAll('.', ' · ');
}

function fieldLabel(field: string, t?: TFunction) {
  const normalized = field.replace(/\[\d+\]/g, '');
  for (const candidate of [normalized, normalized.split('.').at(-1) ?? normalized]) {
    const key = candidate.replaceAll('.', '_');
    const fallback = englishFields[key as keyof typeof englishFields];
    if (typeof fallback === 'string') return t ? t(`fields.${key}`) : fallback;
    const modbusFallback = englishModbus[key as keyof typeof englishModbus];
    if (typeof modbusFallback === 'string' && !modbusFallback.includes('{{'))
      return t ? t(`modbus.${key}`) : modbusFallback;
  }
  return undefined;
}

/** Read-only reviews match structural edits by identity, not shifting array positions. */
export function readableStructuralChanges(
  changes: ConfigurationDiff[],
  before: WagoConfigurationSnapshot | null,
  after: WagoConfigurationSnapshot,
): ConfigurationDiff[] {
  if (!before) return changes;
  let result = changes;
  function equal(left: unknown, right: unknown): boolean {
    if (left === right) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    if (Array.isArray(left) || Array.isArray(right))
      return (
        Array.isArray(left) &&
        Array.isArray(right) &&
        left.length === right.length &&
        left.every((item, index) => equal(item, right[index]))
      );
    const a = left as Record<string, unknown>;
    const b = right as Record<string, unknown>;
    return (
      Object.keys(a).length === Object.keys(b).length &&
      Object.keys(a).every((key) => Object.prototype.hasOwnProperty.call(b, key) && equal(a[key], b[key]))
    );
  }
  for (const collection of ['logicalChannels', 'physicalPoints'] as const) {
    if (
      equal(
        before[collection].map((item) => item.id),
        after[collection].map((item) => item.id),
      )
    )
      continue;
    result = result.filter((change) => !change.path.replace(/^\$\./, '').startsWith(`${collection}[`));
    const previous = new Map<string, unknown>(before[collection].map((item) => [item.id, item] as const));
    const current = new Map<string, unknown>(after[collection].map((item) => [item.id, item] as const));
    for (const id of new Set([...previous.keys(), ...current.keys()])) {
      if (equal(previous.get(id), current.get(id))) continue;
      result.push({
        path: `$.${collection}[id:${encodeURIComponent(id)}]`,
        previous: previous.get(id),
        current: current.get(id),
      });
    }
  }
  return result;
}

export function changeLabel(
  change: ConfigurationDiff,
  before: WagoConfigurationSnapshot | null,
  after: WagoConfigurationSnapshot,
  names: Record<string, string>,
  t?: TFunction,
) {
  const structural = change.path.match(/^\$\.(logicalChannels|physicalPoints)\[id:(.*)\]$/);
  if (structural) {
    const id = decodeURIComponent(structural[2]);
    const label = names[id] ?? id;
    return `${label} · ${t ? t(change.current === undefined ? 'fields.removed' : change.previous === undefined ? 'fields.added' : 'fields.changed') : change.current === undefined ? 'Removed' : change.previous === undefined ? 'Added' : 'Changed'}`;
  }
  const modbus = change.path.match(/^(?:\$\.)?modbus\.(connections|devices|profiles)\[(\d+)\](.*)$/);
  if (modbus) {
    const collection = modbus[1] as 'connections' | 'devices' | 'profiles';
    const index = Number(modbus[2]);
    const item = after.modbus?.[collection][index] ?? before?.modbus?.[collection][index];
    const label =
      item && 'name' in item ? item.name : t ? t('fields.connection', { index: index + 1 }) : `Connection ${index + 1}`;
    const field = modbus[3].slice(1);
    return `${label}${field ? ` · ${names[field] ?? fieldLabel(field, t) ?? words(field)}` : ''}`;
  }
  const match = change.path.match(/^(?:\$\.)?(logicalChannels|physicalPoints)\[(\d+)\](.*)$/);
  if (!match)
    return change.path === '$'
      ? t
        ? t('fields.configuration')
        : 'Configuration'
      : words(change.path.replace(/^\$\./, ''));
  const collection = match[1] as 'logicalChannels' | 'physicalPoints';
  const item = after[collection][Number(match[2])] ?? before?.[collection][Number(match[2])];
  const label =
    item && names[item.id]
      ? names[item.id]
      : t
        ? t(collection === 'logicalChannels' ? 'fields.channelTitle' : 'fields.pointTitle', {
            index: Number(match[2]) + 1,
          })
        : `${collection === 'logicalChannels' ? 'Channel' : 'Physical point'} ${Number(match[2]) + 1}`;
  const field = match[3].slice(1);
  return `${label}${field ? ` · ${fieldLabel(field, t) ?? words(field)}` : ''}`;
}

export function configurationNames(
  snapshot: WagoConfigurationSnapshot | null,
  names: Record<string, string>,
  t?: TFunction,
  translateName: (name: string) => string = (name) => name,
) {
  const modbus = snapshot?.modbus;
  if (!modbus) return names;
  return {
    ...Object.fromEntries([
      ...modbus.connections.map((c, index) => [
        c.id,
        t ? t('fields.connection', { index: index + 1 }) : `Connection ${index + 1}`,
      ]),
      ...modbus.devices.map((d) => [d.id, d.name]),
      ...[...BUILTIN_MODBUS_PROFILES, ...modbus.profiles].map((p) => [
        p.id,
        modbusDisplayName(p, p.name, translateName),
      ]),
    ]),
    ...names,
  };
}
