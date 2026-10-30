/**
 * Limits on a controller configuration, shared by the editor, the API and the runtime so all three
 * refuse the same revisions. They apply to new revisions and rollbacks only: a configuration that is
 * already running or is redelivered is never rejected for exceeding them.
 */
export const CONFIGURATION_LIMIT_CODE = 'configuration_limit_exceeded';

/** Whole desired message: the snapshot plus its envelope. The runtime drops larger messages unanswered. */
export const MAX_CONFIGURATION_BYTES = 1024 * 1024;
/** Room kept for the desired-message envelope (revision, hash, runtime policy fields). */
export const DESIRED_ENVELOPE_RESERVE_BYTES = 1024;
export const MAX_CONFIGURATION_DEPTH = 16;
export const MAX_IDENTIFIER_CHARS = 256;
/** Physical points, and logical channels, a configuration may hold, enabled or not. */
export const MAX_CONFIGURATION_ITEMS = 2048;
/** Logical channels without `enabled: false`: what the runtime actually polls, publishes and commands. */
export const MAX_ENABLED_CHANNELS = 256;
/** The status report a controller publishes must always fit this, whatever its readings are. */
export const MAX_STATUS_REPORT_BYTES = 64 * 1024;
/** Budget the runtime gives readiness errors inside the status message. */
export const STATUS_ERROR_BUDGET_BYTES = 8 * 1024;
/** Fixed fields of a status message: envelope, revision, hash, flags, brackets. */
export const STATUS_FIXED_BYTES = 1024;

export type ConfigurationLimitViolation =
  | { limit: 'bytes'; actual: number; max: number }
  | { limit: 'depth'; max: number }
  | { limit: 'identifier'; path: string; reason: 'length' | 'control'; max: number }
  | { limit: 'points' | 'channels' | 'enabled-channels'; actual: number; max: number }
  | { limit: 'status-report'; actual: number; max: number };

const encoder = new TextEncoder();
// eslint-disable-next-line no-control-regex -- control characters are exactly what is refused.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;
const IDENTIFIER_KEY = /^(?:id|[A-Za-z]*Id)$/;

const byteLength = (value: unknown) => encoder.encode(JSON.stringify(value)).byteLength;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Whether nesting exceeds `max`, iteratively so a hostile document cannot overflow the stack. */
function depthExceeds(root: unknown, max: number): boolean {
  const stack: Array<[unknown, number]> = [[root, 1]];
  while (stack.length) {
    const [value, depth] = stack.pop() as [unknown, number];
    if (!value || typeof value !== 'object') continue;
    if (depth > max) return true;
    for (const child of Array.isArray(value) ? value : Object.values(value)) stack.push([child, depth + 1]);
  }
  return false;
}

function identifierViolation(root: unknown): ConfigurationLimitViolation | undefined {
  const stack: Array<[unknown, string]> = [[root, '$']];
  while (stack.length) {
    const [value, path] = stack.pop() as [unknown, string];
    if (Array.isArray(value)) value.forEach((item, index) => stack.push([item, `${path}[${index}]`]));
    else if (isRecord(value))
      for (const [key, item] of Object.entries(value)) {
        if (typeof item === 'string' && IDENTIFIER_KEY.test(key)) {
          if (item.length > MAX_IDENTIFIER_CHARS)
            return { limit: 'identifier', path: `${path}.${key}`, reason: 'length', max: MAX_IDENTIFIER_CHARS };
          if (CONTROL_CHARACTERS.test(item))
            return { limit: 'identifier', path: `${path}.${key}`, reason: 'control', max: MAX_IDENTIFIER_CHARS };
        }
        stack.push([item, `${path}.${key}`]);
      }
  }
  return undefined;
}

/** A channel is enabled unless it says `enabled: false`; absent means enabled. */
export function channelEnabled(channel: unknown): boolean {
  return !isRecord(channel) || channel.enabled !== false;
}

const capabilitiesOf = (channel: Record<string, unknown>): unknown[] =>
  Array.isArray(channel.capabilities) ? channel.capabilities : [];

/**
 * Upper bound of the state message a controller publishes for this snapshot, mirroring the runtime's
 * state publication: an enabled output channel can appear in the output map, the commanded map and the
 * manual list; an enabled input channel on a non-Modbus (digital) point appears in the input map. A
 * Modbus channel without output capability, such as a meter reading, never appears there. A channel
 * whose point cannot be resolved is counted as digital, so the bound stays conservative. The readiness
 * errors have their own fixed budget.
 */
export function worstCaseStatusReportBytes(snapshot: {
  physicalPoints?: unknown[];
  logicalChannels?: unknown[];
}): number {
  // Validation rejects duplicate point IDs, so a valid snapshot has one point per ID. For a snapshot with
  // duplicates the first point decides here, whereas the runtime's Map keeps the last one.
  const pointIsModbus = new Map<string, boolean>();
  for (const point of Array.isArray(snapshot.physicalPoints) ? snapshot.physicalPoints : [])
    if (isRecord(point) && typeof point.id === 'string' && !pointIsModbus.has(point.id))
      pointIsModbus.set(point.id, Boolean(point.modbus));
  let total = STATUS_FIXED_BYTES + STATUS_ERROR_BUDGET_BYTES;
  for (const channel of Array.isArray(snapshot.logicalChannels) ? snapshot.logicalChannels : []) {
    if (!isRecord(channel) || !channelEnabled(channel)) continue;
    const capabilities = capabilitiesOf(channel);
    const output = capabilities.includes('output');
    const digitalInput =
      !output &&
      capabilities.includes('input') &&
      !(typeof channel.physicalPointId === 'string' && pointIsModbus.get(channel.physicalPointId));
    if (!output && !digitalInput) continue;
    const id = typeof channel.id === 'string' ? channel.id : '';
    const idBytes = encoder.encode(JSON.stringify(id)).byteLength;
    // `"id":false,` is idBytes + 7. Outputs: the state map, the commanded map and `"id",` in the manual list.
    total += output ? (idBytes + 7) * 2 + idBytes + 1 : idBytes + 7;
  }
  return total;
}

/** Every limit the snapshot breaks, cheapest checks first. */
export function configurationLimitViolations(snapshot: unknown): ConfigurationLimitViolation[] {
  const violations: ConfigurationLimitViolation[] = [];
  const bytes = (() => {
    try {
      return byteLength(snapshot) + DESIRED_ENVELOPE_RESERVE_BYTES;
    } catch {
      return Infinity;
    }
  })();
  if (bytes > MAX_CONFIGURATION_BYTES) {
    violations.push({ limit: 'bytes', actual: bytes, max: MAX_CONFIGURATION_BYTES });
    // Anything this large is not walked further.
    return violations;
  }
  if (depthExceeds(snapshot, MAX_CONFIGURATION_DEPTH)) {
    violations.push({ limit: 'depth', max: MAX_CONFIGURATION_DEPTH });
    return violations;
  }
  const identifier = identifierViolation(snapshot);
  if (identifier) violations.push(identifier);
  if (isRecord(snapshot)) {
    for (const [limit, collection] of [
      ['points', snapshot.physicalPoints],
      ['channels', snapshot.logicalChannels],
    ] as const)
      if (Array.isArray(collection) && collection.length > MAX_CONFIGURATION_ITEMS)
        violations.push({ limit, actual: collection.length, max: MAX_CONFIGURATION_ITEMS });
    if (Array.isArray(snapshot.logicalChannels)) {
      const enabled = snapshot.logicalChannels.filter(channelEnabled).length;
      if (enabled > MAX_ENABLED_CHANNELS)
        violations.push({ limit: 'enabled-channels', actual: enabled, max: MAX_ENABLED_CHANNELS });
    }
    const report = worstCaseStatusReportBytes(snapshot as { physicalPoints?: unknown[]; logicalChannels?: unknown[] });
    if (report > MAX_STATUS_REPORT_BYTES)
      violations.push({ limit: 'status-report', actual: report, max: MAX_STATUS_REPORT_BYTES });
  }
  return violations;
}

/**
 * English text for each violation. It contains no configuration content, only the limit, so the
 * editor can translate it by exact message (see the German entries in `server-messages.de.json`).
 */
export const CONFIGURATION_LIMIT_MESSAGES = {
  bytes:
    'The configuration is too large to send to the controller (limit 1 MiB). Remove devices, channels or custom profiles.',
  depth: 'The configuration is nested deeper than 16 levels. Simplify custom profiles or remove nested settings.',
  identifierLength: 'An ID is longer than 256 characters. Shorten it.',
  identifierControl: 'An ID contains control characters such as line breaks or tabs. Remove them.',
  points:
    'The configuration has more than 2048 physical points. Remove points or devices; each built-in 879-3020 meter adds 131.',
  channels:
    'The configuration has more than 2048 channels. Remove channels or devices; each built-in 879-3020 meter adds 131 channels.',
  enabledChannels:
    'More than 256 channels are enabled. Disable meter readings you do not need or remove channels; each built-in 879-3020 meter adds 131 channels, of which 11 are enabled by default.',
  statusReport:
    'The controller status report could exceed 64 KiB with these digital and output channel IDs. Shorten those IDs or remove channels.',
} as const;

export function describeConfigurationLimit(violation: ConfigurationLimitViolation): string {
  switch (violation.limit) {
    case 'bytes':
      return CONFIGURATION_LIMIT_MESSAGES.bytes;
    case 'depth':
      return CONFIGURATION_LIMIT_MESSAGES.depth;
    case 'identifier':
      return violation.reason === 'length'
        ? CONFIGURATION_LIMIT_MESSAGES.identifierLength
        : CONFIGURATION_LIMIT_MESSAGES.identifierControl;
    case 'points':
      return CONFIGURATION_LIMIT_MESSAGES.points;
    case 'channels':
      return CONFIGURATION_LIMIT_MESSAGES.channels;
    case 'enabled-channels':
      return CONFIGURATION_LIMIT_MESSAGES.enabledChannels;
    case 'status-report':
      return CONFIGURATION_LIMIT_MESSAGES.statusReport;
  }
}

export type ConfigurationLimitError = { path: string; code: typeof CONFIGURATION_LIMIT_CODE; message: string };

/** Validation errors for every limit the snapshot breaks; empty when it is within all of them. */
export function configurationLimitErrors(snapshot: unknown, rootPath = 'snapshot'): ConfigurationLimitError[] {
  return configurationLimitViolations(snapshot).map((violation) => ({
    path: violation.limit === 'identifier' ? violation.path.replace(/^\$/, rootPath) : rootPath,
    code: CONFIGURATION_LIMIT_CODE,
    message: describeConfigurationLimit(violation),
  }));
}
