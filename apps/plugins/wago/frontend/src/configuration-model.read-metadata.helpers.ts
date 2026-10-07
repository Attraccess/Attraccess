import type { ConfigurationEditorMetadata } from './api';
import { emptyMetadata } from './configuration-model.state';
import type { WagoConfigurationSnapshot } from './api';
import { digitalTerminalLabel } from '../../backend/configuration-digital';
import type { TFunction } from '@attraccess/plugins-frontend-ui';
import type { ValueContext } from './configuration-model.contracts';
import { profileForDevice } from './configuration-model.add-digital-channel.helpers';
import { readableValue } from './configuration-model.readable-value';
import type { ConfigurationDiff } from './api';

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
  const devicePath = path.match(/^(?:\$\.)?modbus\.devices\[(\d+)\]/);
  const device = devicePath && context.modbus?.devices[Number(devicePath[1])];
  if (device) context.profile = profileForDevice(context.modbus, device.id);
  const field =
    path
      .split('.')
      .at(-1)
      ?.replace(/\[\d+\]$/, '') ?? '';
  return readableValue(value, names, t, field, context);
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
export function words(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('-', ' ')
    .replaceAll('.', ' · ');
}
