import { CONFIGURATION_PROTOCOL_VERSION } from './protocol.state';
import type { WagoAnnouncement } from './protocol.contracts';
import { SUPPORTED_PROTOCOL_MAJOR } from './protocol.state';
import { REQUIRED_CAPABILITIES } from './protocol.state';
import { DISCOVERY_ROOT } from './protocol.state';
import type { WagoHeartbeat } from './protocol.contracts';
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
export function parseObject(payload: Buffer, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(payload.toString('utf8'));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

export function parseHeartbeat(payload: Buffer): WagoHeartbeat {
  const input = parseObject(payload, 'announcement');
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
  const heartbeat = parseHeartbeat(payload);
  const input = JSON.parse(payload.toString('utf8')) as Record<string, unknown>;
  if (typeof input.pairingCode !== 'string' || !input.pairingCode.trim())
    throw new Error('announcement pairingCode is required');
  return { ...heartbeat, pairingCode: input.pairingCode.trim() };
}
