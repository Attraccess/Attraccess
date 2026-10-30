import type { Measurement } from '../../measurement-contract';
import { parseMeasurement } from '../../measurement-contract';

export const CONFIGURATION_PROTOCOL_VERSION = 1;

export const CONFIGURATION_CAPABILITY = `configuration-v${CONFIGURATION_PROTOCOL_VERSION}`;

export const DISCOVERY_ROOT = 'attraccess/wago/discovery';

export const REQUIRED_CAPABILITIES = ['claim', 'heartbeat', CONFIGURATION_CAPABILITY] as const;

export const SUPPORTED_PROTOCOL_MAJOR = 1;

export type WagoOperationalMessageBase = {
  timestamp: string;
  streamId: string;
  sequence: number;
};

export type WagoAcknowledgementMessage = WagoOperationalMessageBase & {
  category: 'acknowledgement';
  id: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  error?: string;
};

export interface WagoAnnouncement {
  hardwareId: string;
  pairingCode: string;
  enrollmentSecret?: string;
  fingerprint?: string;
  protocolVersion: string;
  runtimeVersion: string;
  runtimeImageId?: string;
  runtimePolicyToken?: string;
  capabilities: string[];
  sequence?: number;
}

export type WagoFaultMessage = WagoOperationalMessageBase & {
  category: 'fault';
  channelId: string;
  code: string;
  message: string;
};

export type WagoHeartbeat = Omit<WagoAnnouncement, 'pairingCode'>;

export type WagoMeasurementMessage = WagoOperationalMessageBase &
  Measurement & {
    category: 'measurement';
  };

export type WagoStateMessage = WagoOperationalMessageBase & {
  category: 'state';
  connected: boolean;
  revision: number | null;
  contentHash: string | null;
  outputs: Record<string, boolean>;
  inputs?: Record<string, boolean>;
  readiness?: { hardwareAvailable: boolean };
};

export type WagoOperationalMessage =
  WagoStateMessage | WagoMeasurementMessage | WagoFaultMessage | WagoAcknowledgementMessage;

export function normalizeOperationalPrefix(prefix: string): string {
  const trimmed = prefix.trim();
  let start = 0;
  let end = trimmed.length;
  while (trimmed[start] === '/') start += 1;
  while (trimmed[end - 1] === '/') end -= 1;
  const normalized = trimmed.slice(start, end);
  if (!normalized || normalized.split('/').some((segment) => !segment || /[+#]/.test(segment)))
    throw new Error('MQTT prefix must contain non-empty segments without wildcards');
  return normalized;
}

export function acknowledgementHardwareId(prefix: string, topic: string): string | null {
  const topicPrefix = `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/`;
  const topicSuffix = '/acknowledgements';
  if (!topic.startsWith(topicPrefix) || !topic.endsWith(topicSuffix)) return null;
  const hardwareId = topic.slice(topicPrefix.length, -topicSuffix.length);
  return hardwareId && !/[+/]/.test(hardwareId) ? hardwareId : null;
}

export function acknowledgementTopic(prefix: string, hardwareId: string): string {
  if (!hardwareId || /[+/]/.test(hardwareId))
    throw new Error('hardware ID must not be empty or contain MQTT wildcards');
  return `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/${hardwareId}/acknowledgements`;
}

export function acknowledgementWildcardTopic(prefix: string): string {
  return `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/+/acknowledgements`;
}

export function commandTopic(prefix: string, hardwareId: string): string {
  return `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/${hardwareId}/commands`;
}

export function compatibilityError(
  announcement: Pick<WagoAnnouncement, 'protocolVersion' | 'capabilities'>,
): string | null {
  const major = Number(announcement.protocolVersion.split('.')[0]);
  if (!Number.isInteger(major))
    return `Protocol version "${announcement.protocolVersion}" is invalid; install a CC100 runtime using protocol ${SUPPORTED_PROTOCOL_MAJOR}.x.`;
  if (major !== SUPPORTED_PROTOCOL_MAJOR)
    return `Protocol ${announcement.protocolVersion} is incompatible; this plugin supports protocol ${SUPPORTED_PROTOCOL_MAJOR}.x.`;
  const missing = REQUIRED_CAPABILITIES.filter((capability) => !announcement.capabilities.includes(capability));
  return missing.length
    ? `Controller is missing required capabilities: ${missing.join(', ')}. Update the CC100 runtime.`
    : null;
}

export function configurationDesiredTopic(prefix: string, hardwareId: string): string {
  return `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/${hardwareId}/configuration/desired`;
}

export function configurationReportedHardwareId(prefix: string, topic: string): string | null {
  const topicPrefix = `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/`;
  const topicSuffix = '/configuration/reported';
  if (!topic.startsWith(topicPrefix) || !topic.endsWith(topicSuffix)) return null;
  const hardwareId = topic.slice(topicPrefix.length, -topicSuffix.length);
  return hardwareId && !/[+/]/.test(hardwareId) ? hardwareId : null;
}

export function configurationReportedTopic(prefix: string, hardwareId: string): string {
  return `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/${hardwareId}/configuration/reported`;
}

export function configurationReportedWildcardTopic(prefix: string): string {
  return configurationReportedTopic(prefix, '+');
}

export function discoveryTopic(hardwareId: string): string {
  return `${DISCOVERY_ROOT}/${hardwareId}`;
}

export function heartbeatTopic(prefix: string, hardwareId: string): string {
  return `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/${hardwareId}/heartbeat`;
}

export function isBooleanRecord(value: unknown): boolean {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'boolean')
  );
}

export function isNullableInteger(value: unknown): boolean {
  return value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
}

export function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

export function operationalWildcardTopic(prefix: string): string {
  return `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/+/#`;
}

/** Largest controller-originated payload any server entry point decodes. */
export const CONTROLLER_PAYLOAD_MAX_BYTES = 64 * 1024;

/** Deepest object/array nesting accepted in a controller-originated payload. */
export const CONTROLLER_PAYLOAD_MAX_DEPTH = 8;

/** Whether `text` nests objects/arrays deeper than `maxDepth`, without parsing it. */
export function exceedsJsonDepth(text: string, maxDepth: number): boolean {
  let depth = 0;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{' || char === '[') {
      depth += 1;
      if (depth > maxDepth) return true;
    } else if (char === '}' || char === ']') depth -= 1;
  }
  return false;
}

/**
 * Decode one controller-originated JSON payload. The size and depth are checked before
 * `toString`/`JSON.parse` so an oversized or deeply nested message costs no allocation.
 */
export function parseControllerJson(payload: Buffer, label: string): unknown {
  if (payload.byteLength > CONTROLLER_PAYLOAD_MAX_BYTES) throw new Error(`${label} is too large`);
  const text = payload.toString('utf8');
  if (exceedsJsonDepth(text, CONTROLLER_PAYLOAD_MAX_DEPTH)) throw new Error(`${label} is nested too deeply`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

export function parseObject(payload: Buffer, label: string): Record<string, unknown> {
  const value = parseControllerJson(payload, label);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

export function parseHeartbeat(payload: Buffer): WagoHeartbeat {
  return heartbeatFromObject(parseObject(payload, 'announcement'));
}

function heartbeatFromObject(input: Record<string, unknown>): WagoHeartbeat {
  const required = ['hardwareId', 'protocolVersion', 'runtimeVersion'];
  for (const key of required)
    if (typeof input[key] !== 'string' || !input[key].trim()) throw new Error(`announcement ${key} is required`);
  if (!Array.isArray(input.capabilities) || input.capabilities.some((item) => typeof item !== 'string'))
    throw new Error('announcement capabilities must be an array of strings');
  if (input.sequence !== undefined && (!Number.isSafeInteger(input.sequence) || (input.sequence as number) < 0))
    throw new Error('announcement sequence must be a non-negative integer');
  if (
    input.runtimeImageId !== undefined &&
    (typeof input.runtimeImageId !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(input.runtimeImageId))
  )
    throw new Error('Invalid runtime image identity');
  if (
    input.runtimePolicyToken !== undefined &&
    (typeof input.runtimePolicyToken !== 'string' || !/^[a-f0-9-]{36}$/.test(input.runtimePolicyToken))
  )
    throw new Error('Invalid runtime policy token');
  return {
    hardwareId: (input.hardwareId as string).trim(),
    enrollmentSecret: typeof input.enrollmentSecret === 'string' ? input.enrollmentSecret.trim() : undefined,
    fingerprint: typeof input.fingerprint === 'string' ? input.fingerprint.trim() : undefined,
    protocolVersion: (input.protocolVersion as string).trim(),
    runtimeVersion: (input.runtimeVersion as string).trim(),
    ...(input.runtimeImageId ? { runtimeImageId: input.runtimeImageId as string } : {}),
    ...(input.runtimePolicyToken ? { runtimePolicyToken: input.runtimePolicyToken as string } : {}),
    capabilities: input.capabilities,
    sequence: input.sequence as number | undefined,
  };
}

export function parseAnnouncement(payload: Buffer): WagoAnnouncement {
  const input = parseObject(payload, 'announcement');
  const heartbeat = heartbeatFromObject(input);
  if (typeof input.pairingCode !== 'string' || !input.pairingCode.trim())
    throw new Error('announcement pairingCode is required');
  return { ...heartbeat, pairingCode: input.pairingCode.trim() };
}

export function requiredTimestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new Error('operational timestamp is invalid');
  return value;
}

export function requiredSequence(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error('operational sequence is invalid');
  return value as number;
}

export function parseStateMessage(
  value: Record<string, unknown>,
  envelope: WagoOperationalMessageBase,
): WagoStateMessage {
  if (
    typeof value.connected !== 'boolean' ||
    !isNullableInteger(value.revision) ||
    !isNullableString(value.contentHash) ||
    !isBooleanRecord(value.outputs) ||
    (value.inputs !== undefined && !isBooleanRecord(value.inputs)) ||
    (value.readiness !== undefined &&
      (!value.readiness ||
        typeof value.readiness !== 'object' ||
        Array.isArray(value.readiness) ||
        typeof (value.readiness as Record<string, unknown>).hardwareAvailable !== 'boolean'))
  )
    throw new Error('invalid state message');
  return {
    category: 'state',
    ...envelope,
    connected: value.connected,
    revision: value.revision as number | null,
    contentHash: value.contentHash as string | null,
    outputs: value.outputs as Record<string, boolean>,
    ...(value.inputs !== undefined ? { inputs: value.inputs as Record<string, boolean> } : {}),
    ...(value.readiness !== undefined
      ? { readiness: { hardwareAvailable: (value.readiness as { hardwareAvailable: boolean }).hardwareAvailable } }
      : {}),
  };
}

export function parseOperationalMessage(
  prefix: string,
  topic: string,
  payload: Buffer,
): { hardwareId: string; message: WagoOperationalMessage } | null {
  const root = `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/`;
  if (!topic.startsWith(root)) return null;
  const [hardwareId, suffix, extra] = topic.slice(root.length).split('/');
  if (
    !hardwareId ||
    /[+#]/.test(hardwareId) ||
    extra !== undefined ||
    !['state', 'measurements', 'faults', 'acknowledgements'].includes(suffix)
  )
    return null;
  const value = parseObject(payload, 'operational message');
  const timestamp = requiredTimestamp(value.timestamp);
  const sequence = requiredSequence(value.sequence);
  if (typeof value.streamId !== 'string' || !value.streamId.trim() || value.streamId.length > 128)
    throw new Error('operational streamId is invalid');
  const streamId = value.streamId;
  if (suffix === 'state') {
    return { hardwareId, message: parseStateMessage(value, { timestamp, streamId, sequence }) };
  }
  if (suffix === 'measurements') {
    return {
      hardwareId,
      message: {
        category: 'measurement',
        timestamp,
        streamId,
        sequence,
        ...parseMeasurement(value),
      },
    };
  }
  if (suffix === 'faults') {
    if (typeof value.channelId !== 'string' || typeof value.code !== 'string' || typeof value.message !== 'string')
      throw new Error('invalid fault message');
    return {
      hardwareId,
      message: {
        category: 'fault',
        timestamp,
        streamId,
        sequence,
        channelId: value.channelId,
        code: value.code,
        message: value.message,
      },
    };
  }
  if (
    typeof value.id !== 'string' ||
    !['accepted', 'duplicate', 'rejected'].includes(value.status as string) ||
    (value.error !== undefined && typeof value.error !== 'string')
  )
    throw new Error('invalid acknowledgement message');
  return {
    hardwareId,
    message: {
      category: 'acknowledgement',
      timestamp,
      streamId,
      sequence,
      id: value.id,
      status: value.status as 'accepted' | 'duplicate' | 'rejected',
      error: value.error as string | undefined,
    },
  };
}
