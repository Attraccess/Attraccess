// Which logical channels may carry `enabled: false`. Shared by server validation and the editor so both
// apply one rule.

/** Capabilities a disabled channel may have: it only reads a Modbus measurement. */
export const DISABLEABLE_CAPABILITIES: ReadonlySet<string> = new Set(['input', 'measurement']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether a channel with these capabilities on this physical point may be disabled: only a channel on a
 * Modbus measurement point without an action, whose capabilities are all `input` or `measurement`.
 * Takes unvalidated values so the server can apply it to a snapshot before validation succeeds.
 */
export function canDisableChannel(capabilities: Iterable<unknown>, point: unknown): boolean {
  const list = [...capabilities];
  const binding = isRecord(point) && isRecord(point.modbus) ? point.modbus : undefined;
  return Boolean(
    isRecord(point) &&
    point.hardwareProfile === 'modbus' &&
    binding &&
    typeof binding.measurementId === 'string' &&
    binding.measurementId &&
    binding.actionId === undefined &&
    list.length &&
    list.every((capability) => typeof capability === 'string' && DISABLEABLE_CAPABILITIES.has(capability)),
  );
}
