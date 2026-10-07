import { CANONICAL_UNITS } from './diagnostics-envelope';
import { MAX_CHANNELS } from './diagnostics-store.state';
export function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 256 &&
    !Array.from(value).some((character) => character.charCodeAt(0) < 32)
  );
}
export function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function validEventPayload(data: Record<string, unknown>, kind: string, canonical: boolean): boolean {
  if (
    canonical &&
    kind === 'configuration/reported' &&
    (!Number.isSafeInteger(data.revision) ||
      (data.revision as number) < 1 ||
      typeof data.contentHash !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(data.contentHash) ||
      !Array.isArray(data.errors))
  )
    return false;
  if (
    kind === 'measurements' &&
    (!identifier(data.channelId) ||
      typeof data.value !== 'number' ||
      !Number.isFinite(data.value) ||
      (canonical
        ? !Number.isSafeInteger(data.value) ||
          !CANONICAL_UNITS.includes(data.unit as string) ||
          !['live', 'cumulative'].includes(data.kind as string)
        : !['ampere', 'volt', 'watt', 'percent'].includes(data.unit as string)))
  )
    return false;
  if (kind === 'faults' && !identifier(data.channelId)) return false;
  if (
    kind === 'acknowledgements' &&
    (!identifier(data.id) || !['accepted', 'duplicate', 'rejected'].includes(data.status as string))
  )
    return false;
  return true;
}

export function validStatePayload(data: Record<string, unknown>, kind: string, canonical: boolean): boolean {
  if (
    kind === 'state' &&
    data.manualOutputChannelIds !== undefined &&
    (!Array.isArray(data.manualOutputChannelIds) ||
      data.manualOutputChannelIds.length > MAX_CHANNELS ||
      !data.manualOutputChannelIds.every(identifier))
  )
    return false;
  if (
    canonical &&
    kind === 'state' &&
    data.readiness !== undefined &&
    (!isObject(data.readiness) ||
      (data.readiness.hardwareAvailable !== undefined && typeof data.readiness.hardwareAvailable !== 'boolean'))
  )
    return false;
  if (
    canonical &&
    kind === 'state' &&
    !(data.contentHash === null || (typeof data.contentHash === 'string' && /^[0-9a-f]{64}$/i.test(data.contentHash)))
  )
    return false;
  if (
    canonical &&
    kind === 'state' &&
    (typeof data.connected !== 'boolean' ||
      !(data.revision === null || (Number.isSafeInteger(data.revision) && (data.revision as number) >= 0)) ||
      !isObject(data.outputs) ||
      (data.inputs !== undefined && !isObject(data.inputs)) ||
      ![...Object.values(data.outputs), ...Object.values(isObject(data.inputs) ? data.inputs : {})].every(
        (value) => typeof value === 'boolean',
      ))
  )
    return false;
  return true;
}
