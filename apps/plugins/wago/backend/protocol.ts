import { parseMeasurement, type Measurement } from '../measurement-contract';

export const DISCOVERY_ROOT = 'attraccess/wago/discovery';
export const CONFIGURATION_PROTOCOL_VERSION = 1;
export const CONFIGURATION_CAPABILITY = `configuration-v${CONFIGURATION_PROTOCOL_VERSION}`;
export const REQUIRED_CAPABILITIES = ['claim', 'heartbeat', CONFIGURATION_CAPABILITY] as const;
export const SUPPORTED_PROTOCOL_MAJOR = 1;

export interface WagoAnnouncement {
  hardwareId: string;
  pairingCode: string;
  enrollmentSecret?: string;
  fingerprint?: string;
  protocolVersion: string;
  runtimeVersion: string;
  capabilities: string[];
  sequence?: number;
}

export function parseAnnouncement(payload: Buffer): WagoAnnouncement {
  let value: unknown;
  try {
    value = JSON.parse(payload.toString('utf8'));
  } catch {
    throw new Error('announcement is not valid JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('announcement must be an object');
  const input = value as Record<string, unknown>;
  const required = ['hardwareId', 'pairingCode', 'protocolVersion', 'runtimeVersion'];
  for (const key of required)
    if (typeof input[key] !== 'string' || !input[key].trim()) throw new Error(`announcement ${key} is required`);
  if (!Array.isArray(input.capabilities) || input.capabilities.some((item) => typeof item !== 'string'))
    throw new Error('announcement capabilities must be an array of strings');
  if (input.sequence !== undefined && (!Number.isSafeInteger(input.sequence) || (input.sequence as number) < 0))
    throw new Error('announcement sequence must be a non-negative integer');
  return {
    hardwareId: (input.hardwareId as string).trim(),
    pairingCode: (input.pairingCode as string).trim(),
    enrollmentSecret: typeof input.enrollmentSecret === 'string' ? input.enrollmentSecret.trim() : undefined,
    fingerprint: typeof input.fingerprint === 'string' ? input.fingerprint.trim() : undefined,
    protocolVersion: (input.protocolVersion as string).trim(),
    runtimeVersion: (input.runtimeVersion as string).trim(),
    capabilities: input.capabilities,
    sequence: input.sequence as number | undefined,
  };
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

export function discoveryTopic(hardwareId: string): string {
  return `${DISCOVERY_ROOT}/${hardwareId}`;
}
export function heartbeatTopic(prefix: string, hardwareId: string): string {
  return `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/${hardwareId}/heartbeat`;
}

export function configurationDesiredTopic(prefix: string, hardwareId: string): string {
  return `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/${hardwareId}/configuration/desired`;
}

export function configurationReportedTopic(prefix: string, hardwareId: string): string {
  return `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/${hardwareId}/configuration/reported`;
}

export function commandTopic(prefix: string, hardwareId: string): string {
  return `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/${hardwareId}/commands`;
}

export function acknowledgementTopic(prefix: string, hardwareId: string): string {
  return `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/${hardwareId}/acknowledgements`;
}

export function acknowledgementWildcardTopic(prefix: string): string {
  return acknowledgementTopic(prefix, '+');
}

export function acknowledgementHardwareId(prefix: string, topic: string): string | null {
  const topicPrefix = `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/`;
  const topicSuffix = '/acknowledgements';
  if (!topic.startsWith(topicPrefix) || !topic.endsWith(topicSuffix)) return null;
  const hardwareId = topic.slice(topicPrefix.length, -topicSuffix.length);
  return hardwareId && !/[+/]/.test(hardwareId) ? hardwareId : null;
}

export function configurationReportedWildcardTopic(prefix: string): string {
  return configurationReportedTopic(prefix, '+');
}

type WagoOperationalMessageBase = {
  timestamp: string;
  streamId: string;
  sequence: number;
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

export type WagoMeasurementMessage = WagoOperationalMessageBase &
  Measurement & {
    category: 'measurement';
  };

export type WagoFaultMessage = WagoOperationalMessageBase & {
  category: 'fault';
  channelId: string;
  code: string;
  message: string;
};

export type WagoAcknowledgementMessage = WagoOperationalMessageBase & {
  category: 'acknowledgement';
  id: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  error?: string;
};

export type WagoOperationalMessage =
  WagoStateMessage | WagoMeasurementMessage | WagoFaultMessage | WagoAcknowledgementMessage;

export function operationalWildcardTopic(prefix: string): string {
  return `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/+/#`;
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
      hardwareId,
      message: {
        category: 'state',
        timestamp,
        streamId,
        sequence,
        connected: value.connected,
        revision: value.revision as number | null,
        contentHash: value.contentHash as string | null,
        outputs: value.outputs as Record<string, boolean>,
        ...(value.inputs !== undefined ? { inputs: value.inputs as Record<string, boolean> } : {}),
        ...(value.readiness !== undefined
          ? { readiness: { hardwareAvailable: (value.readiness as { hardwareAvailable: boolean }).hardwareAvailable } }
          : {}),
      },
    };
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

export function configurationReportedHardwareId(prefix: string, topic: string): string | null {
  const topicPrefix = `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/`;
  const topicSuffix = '/configuration/reported';
  if (!topic.startsWith(topicPrefix) || !topic.endsWith(topicSuffix)) return null;
  const hardwareId = topic.slice(topicPrefix.length, -topicSuffix.length);
  return hardwareId && !/[+/]/.test(hardwareId) ? hardwareId : null;
}

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

function parseObject(payload: Buffer, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(payload.toString('utf8'));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function requiredTimestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new Error('operational timestamp is invalid');
  return value;
}
function requiredSequence(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error('operational sequence is invalid');
  return value as number;
}
function isNullableInteger(value: unknown): boolean {
  return value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
}
function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}
function isBooleanRecord(value: unknown): boolean {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'boolean')
  );
}
