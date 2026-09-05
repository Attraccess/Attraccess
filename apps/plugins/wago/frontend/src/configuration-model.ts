import { BUILTIN_MODBUS_PROFILES } from '../../modbus/model';
import type { ConfigurationDiff, ConfigurationEditorMetadata, WagoConfigurationSnapshot } from './api';
import { availableDigitalTerminals, digitalTerminalLabel } from '../../backend/configuration-digital';

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
  newId: () => string = () => crypto.randomUUID(),
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

export function pointLabel(point: PhysicalPoint, names: Record<string, string>) {
  return point.hardwareProfile === '751-9301'
    ? `${names[point.id] ?? 'CC100'} · ${digitalTerminalLabel(point.channel)}`
    : `${names[point.id] ?? point.id} · external assignment (${point.hardwareProfile})`;
}

export function readableValue(value: unknown, names: Record<string, string>): string {
  if (value === undefined || value === null) return 'Not configured';
  if (Array.isArray(value)) return value.map((item) => readableValue(item, names)).join(', ') || 'None';
  if (typeof value === 'object') {
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
          `${fieldLabels[key] ?? (key === 'id' ? 'Name' : words(key))}: ${['name', 'host', 'path'].includes(key) && typeof item === 'string' ? item : readableValue(item, names)}`,
      )
      .join('; ');
  }
  if (typeof value === 'string') return names[value] ?? words(value);
  return String(value);
}

export function readableChangeValue(
  path: string,
  value: unknown,
  snapshot: WagoConfigurationSnapshot | null,
  names: Record<string, string>,
) {
  if (/\.(name|host|path)$/.test(path) && typeof value === 'string') return value;
  const point = path.match(/^(?:\$\.)?physicalPoints\[(\d+)\]\.channel$/);
  if (point && typeof value === 'number' && snapshot?.physicalPoints[Number(point[1])]?.hardwareProfile === '751-9301')
    return `CC100 ${digitalTerminalLabel(value)}`;
  return readableValue(value, names);
}

function words(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('-', ' ')
    .replaceAll('.', ' · ');
}

const fieldLabels: Record<string, string> = {
  physicalPointId: 'Physical terminal',
  channel: 'Physical terminal',
  profile: 'Preset profile',
  capabilities: 'Capabilities',
  'disconnectPolicy.mode': 'On disconnect',
  'disconnectPolicy.timeoutMs': 'Watchdog timeout',
  'pulse.durationMs': 'Pulse duration',
  'guard.channelId': 'Guard input',
  'guard.when': 'Guard condition',
  'feedback.channelId': 'Feedback input',
  'feedback.expected': 'Expected feedback',
  'feedback.timeoutMs': 'Feedback timeout',
};

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
  const collections: [string, { id: string }[], { id: string }[]][] = [
    ...(['logicalChannels', 'physicalPoints'] as const).map((key): [string, { id: string }[], { id: string }[]] => [
      key,
      before[key],
      after[key],
    ]),
    ...(['connections', 'devices', 'profiles'] as const).map((key): [string, { id: string }[], { id: string }[]] => [
      `modbus.${key}`,
      before.modbus?.[key] ?? [],
      after.modbus?.[key] ?? [],
    ]),
  ];
  for (const [collection, beforeItems, afterItems] of collections) {
    if (
      equal(
        beforeItems.map((item) => item.id),
        afterItems.map((item) => item.id),
      )
    )
      continue;
    result = result.filter(
      (change) =>
        change.path.replace(/^\$\./, '') !== collection &&
        !change.path.replace(/^\$\./, '').startsWith(`${collection}[`),
    );
    const previous = new Map<string, unknown>(beforeItems.map((item) => [item.id, item] as const));
    const current = new Map<string, unknown>(afterItems.map((item) => [item.id, item] as const));
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
) {
  const structural = change.path.match(
    /^\$\.(logicalChannels|physicalPoints|modbus\.(?:connections|devices|profiles))\[id:(.*)\]$/,
  );
  if (structural) {
    const id = decodeURIComponent(structural[2]);
    const item = change.current ?? change.previous;
    const label = names[id] ?? (item && typeof item === 'object' && 'name' in item ? String(item.name) : id);
    return `${label} · ${change.current === undefined ? 'Removed' : change.previous === undefined ? 'Added' : 'Changed'}`;
  }
  const modbus = change.path.match(/^(?:\$\.)?modbus\.(connections|devices|profiles)\[(\d+)\](.*)$/);
  if (modbus) {
    const collection = modbus[1] as 'connections' | 'devices' | 'profiles';
    const index = Number(modbus[2]);
    const item = after.modbus?.[collection][index] ?? before?.modbus?.[collection][index];
    const label = item && 'name' in item ? item.name : `Connection ${index + 1}`;
    return `${label}${modbus[3] ? ` · ${names[modbus[3].slice(1)] ?? words(modbus[3].slice(1))}` : ''}`;
  }
  const match = change.path.match(/^(?:\$\.)?(logicalChannels|physicalPoints)\[(\d+)\](.*)$/);
  if (!match) return change.path === '$' ? 'Configuration' : words(change.path.replace(/^\$\./, ''));
  const collection = match[1] as 'logicalChannels' | 'physicalPoints';
  const item = after[collection][Number(match[2])] ?? before?.[collection][Number(match[2])];
  const label =
    item && names[item.id]
      ? names[item.id]
      : `${collection === 'logicalChannels' ? 'Channel' : 'Physical point'} ${Number(match[2]) + 1}`;
  const field = match[3].slice(1);
  return `${label}${field ? ` · ${fieldLabels[field] ?? words(field)}` : ''}`;
}

export function configurationNames(snapshot: WagoConfigurationSnapshot | null, names: Record<string, string>) {
  const modbus = snapshot?.modbus;
  if (!modbus) return names;
  return {
    ...Object.fromEntries([
      ...modbus.connections.map((c, index) => [c.id, `Connection ${index + 1}`]),
      ...modbus.devices.map((d) => [d.id, d.name]),
      ...[...BUILTIN_MODBUS_PROFILES, ...modbus.profiles].flatMap((p) => [
        [p.id, p.name],
        ...[...p.measurements, ...p.actions].map((entry) => [entry.id, entry.name]),
      ]),
    ]),
    ...names,
  };
}
