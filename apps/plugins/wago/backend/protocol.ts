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
export function heartbeatTopic(hardwareId: string): string {
  return `attraccess/wago/controllers/${hardwareId}/heartbeat`;
}

export function configurationDesiredTopic(prefix: string, hardwareId: string): string {
  return `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/${hardwareId}/configuration/desired`;
}

export function configurationReportedTopic(prefix: string, hardwareId: string): string {
  return `${normalizeOperationalPrefix(prefix)}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/${hardwareId}/configuration/reported`;
}

export function configurationReportedWildcardTopic(prefix: string): string {
  return configurationReportedTopic(prefix, '+');
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
