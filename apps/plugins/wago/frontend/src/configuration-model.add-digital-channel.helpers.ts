import { randomUUID } from './configuration-id';
import type { WagoConfigurationSnapshot } from './api';
import { availableDigitalTerminals } from '../../backend/configuration-digital';
import type { Channel } from './configuration-model.contracts';
import type { PhysicalPoint } from './configuration-model.contracts';
import type { ConfigurationDiff } from './api';
import type { TFunction } from '@attraccess/plugins-frontend-ui';
import { words } from './configuration-model.read-metadata.helpers';
import { BUILTIN_MODBUS_PROFILES } from '../../modbus/model';
import { modbusDisplayName } from './modbus-labels';
import englishFields from './fields.en.json';
import englishModbus from './modbus.en.json';
import type { ConfigurationEditorMetadata } from './api';
import { digitalTerminalLabel } from '../../backend/configuration-digital';
import englishPresets from './presets.en.json';
import { findProfile } from '../../modbus/model';
import type { ModbusConfiguration } from '../../modbus/model';

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

export function fieldLabel(field: string, t?: TFunction) {
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

export function profileForDevice(modbus: ModbusConfiguration | undefined, deviceId: string) {
  const device = modbus?.devices.find((item) => item.id === deviceId);
  return modbus && device ? findProfile(modbus, device) : undefined;
}
