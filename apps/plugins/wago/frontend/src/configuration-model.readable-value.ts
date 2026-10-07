import { BUILTIN_MODBUS_PROFILES } from '../../modbus/model';
import { digitalTerminalLabel } from '../../backend/configuration-digital';
import type { TFunction } from '@attraccess/plugins-frontend-ui';
import englishFields from './fields.en.json';
import englishChannels from './channels.en.json';
import englishModbus from './modbus.en.json';
import { modbusDisplayName } from './modbus-labels';
import type { ValueContext } from './configuration-model.contracts';
import { profileForDevice } from './configuration-model.add-digital-channel.helpers';
import { fieldLabel } from './configuration-model.add-digital-channel.helpers';
import { words } from './configuration-model.read-metadata.helpers';
import { presetDisplayName } from './configuration-model.add-digital-channel.helpers';

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
      'profileId' in value &&
      typeof value.profileId === 'string' &&
      'profileVersion' in value &&
      typeof value.profileVersion === 'number'
    )
      context = {
        ...context,
        profile: [...BUILTIN_MODBUS_PROFILES, ...(context.modbus?.profiles ?? [])].find(
          (profile) => profile.id === value.profileId && profile.version === value.profileVersion,
        ),
      };
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
    if (field === 'id') return value;
    if (context && (field === 'measurementId' || field === 'actionId')) {
      if (context.metadataNames[value]) return context.metadataNames[value];
      const entries = field === 'measurementId' ? context.profile?.measurements : context.profile?.actions;
      const entry = entries?.find((item) => item.id === value);
      return entry && context.profile ? modbusDisplayName(context.profile, entry.name, context.translateName) : value;
    }
    // Only localize application-defined choices, never identifiers or user text.
    if (field === 'profile' || field === 'presetId') return presetDisplayName(value, t);
    if (context && ['connectionId', 'deviceId', 'profileId'].includes(field)) {
      if (context.metadataNames[value]) return context.metadataNames[value];
      if (field === 'deviceId') return context.modbus?.devices.find((device) => device.id === value)?.name ?? value;
      if (field === 'profileId') {
        const profile =
          context.profile?.id === value
            ? context.profile
            : [...BUILTIN_MODBUS_PROFILES, ...(context.modbus?.profiles ?? [])].find((item) => item.id === value);
        return profile ? modbusDisplayName(profile, profile.name, context.translateName) : value;
      }
      const index = context.modbus?.connections.findIndex((connection) => connection.id === value) ?? -1;
      return index < 0 ? value : t ? t('fields.connection', { index: index + 1 }) : `Connection ${index + 1}`;
    }
    if (['physicalPointId', 'channelId', 'channelIds', 'guardChannelId', 'feedbackChannelId'].includes(field))
      return (context?.metadataNames ?? names)[value] ?? value;
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
