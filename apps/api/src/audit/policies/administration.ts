import { createHash } from 'crypto';
import { EmailTemplateType, NETWORK_RESTRICTION_HEADER_NAME_PATTERN } from '@attraccess/application-models';
import { valid, validRange } from 'semver';
import type { AuthenticationMethod } from '@attraccess/application-models';
import { isAuthenticationMethod } from './projection';

/** URLs may carry credentials, query tokens or private paths: record the origin only. */
export function safeAuditOrigin(value: string): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.origin : 'custom-source';
  } catch {
    return 'custom-source';
  }
}

export function safeRequestedSpec(value: string): string {
  if (value === 'custom-source') return value;
  if (typeof value !== 'string' || value.length > 100) return 'custom-source';
  return validRange(value) || /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(value) ? value : 'custom-source';
}

export function safeAuditHost(value: string): string {
  if (!value || value === 'configured') return value;
  return /^[a-zA-Z0-9_.:[\]-]{1,253}$/.test(value) ? value : 'configured';
}

export function safeAuditSender(value: string): string {
  const address = value.match(/(?:<|^)([^<>\s]+@[^<>\s]+)(?:>|$)/)?.[1];
  return address && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+$/.test(address)
    ? address
    : value
      ? 'configured'
      : '';
}

/** Projection input of an administration-domain event. */
export interface AdministrationAuditInput {
  action: string;
  operationId?: string;
  /** Null only for the system actor, on the actions the host performs on its own. */
  actorId: number | null;
  authenticationMethod?: AuthenticationMethod;
  apiTokenId?: number;
  subjectType: string;
  subjectId: number;
  outcome?: 'succeeded' | 'failed';
  details: Record<string, string | number>;
}

export type Check = (value: unknown) => boolean;

export type PreviousAuditSettings = { enabled: boolean; domains: readonly string[] };

export const text: Check = (v) =>
  typeof v === 'string' && v.length <= 256 && Array.from(v).every((character) => character.charCodeAt(0) >= 32);

/**
 * A plugin manifest's name and version as `pluginName`/`pluginVersion` details, which label the audit target.
 * Blank values are left out, as is anything `text` rejects (over 256 characters, characters below U+0020, not a
 * string), so an odd manifest never makes the whole event drop.
 */
export function auditPluginIdentity(manifest: { name?: unknown; version?: unknown } | undefined) {
  const usable = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && text(value);
  return {
    ...(usable(manifest?.name) ? { pluginName: manifest.name } : {}),
    ...(usable(manifest?.version) ? { pluginVersion: manifest.version } : {}),
  };
}

export const flag: Check = (v) => v === 0 || v === 1;

export const enumeration =
  (...values: string[]): Check =>
  (v) =>
    typeof v === 'string' && values.includes(v);

export const identifier: Check = (v) => typeof v === 'string' && /^[a-zA-Z0-9_.@/-]{1,214}$/.test(v);

export const exactVersion: Check = (v) => typeof v === 'string' && v.length <= 100 && !!valid(v);

export const spec: Check = (v) => typeof v === 'string' && v === safeRequestedSpec(v);

export const origin: Check = (v) => typeof v === 'string' && v === safeAuditOrigin(v);

export const count: Check = (v) => Number.isSafeInteger(v) && (v as number) >= 0;

export const positive: Check = (v) => count(v) && (v as number) > 0;

export const permissions: Check = (v) => {
  if (typeof v !== 'string' || v.length > 4096) return false;
  try {
    const values = JSON.parse(v);
    return (
      Array.isArray(values) &&
      values.length <= 100 &&
      values.every((value) => typeof value === 'string' && /^[a-zA-Z0-9_.*:-]{1,120}$/.test(value))
    );
  } catch {
    return false;
  }
};

export const locale: Check = (v) => typeof v === 'string' && /^[a-z]{2,3}(-[A-Z]{2,3})?$/.test(v);

export const SETTING_KEYS = [
  'app.url',
  'app.publicInternetUrl',
  'app.defaultLanguage',
  'app.licenseKeyConfigured',
  'app.licenseKeyChanged',
  'smtp.service',
  'smtp.host',
  'smtp.port',
  'smtp.secure',
  'smtp.from',
  'smtp.userConfigured',
  'smtp.userChanged',
  'smtp.passConfigured',
  'smtp.passwordChanged',
  'audit.enabled',
  'audit.domains',
  'audit.plugin_domains_disabled',
  'audit.retention_days',
  'resources.activityVisibility',
  'resources.listVisibility',
  'attractap.cardWriterMode',
  'attractap.cardWriterReaders',
  'attractap.cardWriterReaderCount',
  'attractap.allowUidOnlyCards',
  'networkRestriction.enabled',
  'networkRestriction.allowedRanges',
  'networkRestriction.ipSource',
  'networkRestriction.headerName',
  'networkRestriction.roleActions',
  'metrics.apiKeyConfigured',
  'metrics.slowQueryThresholdSeconds',
  ...['http', 'ws', 'cron', 'db', 'external', 'sse', 'flow'].map((key) => `metrics.toggles.${key}`),
  ...['maxAttempts', 'windowSeconds', 'lockoutDurationSeconds', 'exponentialBackoff', 'backoffMultiplier'].map(
    (key) => `auth.rateLimit.${key}`,
  ),
  ...['sendMaxPerWindow', 'sendWindowSeconds', 'contactMaxPerWindow', 'contactWindowSeconds'].map(
    (key) => `messaging.rateLimit.${key}`,
  ),
];

export const settings = { settingKey: enumeration(...SETTING_KEYS), before: text, after: text };

const coreTemplateType = enumeration(...Object.values(EmailTemplateType));

/** A core template type or a plugin template key, `plugin.<plugin name>.<template id>`. */
export const templateType: Check = (v) =>
  coreTemplateType(v) ||
  (typeof v === 'string' && v.length <= 256 && /^plugin\.[a-zA-Z0-9_.@/-]+\.[a-z0-9][a-z0-9_-]*$/.test(v));

export const template = { templateType };

export const mqtt = {
  serverName: text,
  host: (v: unknown) => typeof v === 'string' && v === safeAuditHost(v),
  port: count,
  managementPort: count,
  usernameConfigured: flag,
  passwordChanged: flag,
  useTls: flag,
  caCertConfigured: flag,
  tlsInsecure: flag,
  tlsServername: (v: unknown) => typeof v === 'string' && v === safeAuditHost(v),
  defaultPublishQos: count,
  defaultPublishRetain: flag,
  defaultSubscribeQos: count,
};

export const registry = { registryId: identifier, registryName: text, registryUrl: origin };

export const policy = {
  checksEnabled: flag,
  automaticUpdates: flag,
  updateMode: enumeration('off', 'patch', 'minor', 'follow'),
  // ISO weekdays, comma separated; empty while no day is chosen.
  maintenanceWeekdays: (v: unknown) => typeof v === 'string' && /^([1-7](,[1-7]){0,6})?$/.test(v),
  maintenanceTimeZone: text,
  maintenanceStartMinute: count,
  maintenanceDurationMinutes: count,
  prerelease: flag,
};

export const pkg = {
  packageName: identifier,
  oldVersion: exactVersion,
  newVersion: exactVersion,
  requestedSpec: spec,
  registryId: identifier,
  registryUrl: origin,
  integrity: (v: unknown) => typeof v === 'string' && /^(sha1|sha256|sha384|sha512)-[A-Za-z0-9+/=]{1,160}$/.test(v),
  integrityResult: enumeration('verified', 'not-checked'),
  provenanceResult: enumeration('not-verified'),
  classification: enumeration('official', 'community'),
  permissionAdditions: permissions,
  permissionRemovals: permissions,
  migrationOutcome: enumeration('pending-restart', 'not-run', 'not-applicable', 'succeeded', 'failed'),
  activationOutcome: enumeration('restart-requested', 'quarantined', 'removed', 'not-attempted', 'failed', 'succeeded'),
  restartRequested: flag,
  rollbackOutcome: enumeration('not-needed', 'succeeded', 'failed', 'unknown'),
  updateOverride: enumeration('inherit', 'off', 'patch', 'minor', 'follow'),
  candidate: (v: unknown) => v === '' || exactVersion(v),
  checkState: enumeration('up-to-date', 'available', 'blocked', 'failed'),
};

export const rules: Record<string, { subject: string; fields: Record<string, Check> }> = {
  'settings.updated': { subject: 'setting', fields: settings },
  'settings.api_key.generated': {
    subject: 'setting',
    fields: { settingKey: enumeration('metrics.apiKeyConfigured'), configured: flag },
  },
  'settings.api_key.deleted': {
    subject: 'setting',
    fields: { settingKey: enumeration('metrics.apiKeyConfigured'), configured: flag },
  },
};

for (const action of ['updated', 'reset']) {
  rules[`email_template.${action}`] = { subject: 'email-template', fields: template };
  rules[`email_layout.${action}`] = { subject: 'email-layout', fields: {} };
}
rules['email_template.translations_set'] = {
  subject: 'email-template',
  fields: { ...template, locale, translationCount: count },
};
rules['email_template.translations_deleted'] = { subject: 'email-template', fields: { ...template, locale } };
for (const action of ['created', 'updated', 'deleted'])
  rules[`mqtt_server.${action}`] = { subject: 'mqtt-server', fields: mqtt };
// The payload is never recorded, only the topic and its size.
rules['mqtt_server.message_subscribe'] = { subject: 'mqtt-server', fields: { serverName: text, topic: text } };
rules['mqtt_server.message_publish'] = {
  subject: 'mqtt-server',
  fields: {
    serverName: text,
    topic: text,
    size: count,
    qos: (v: unknown) => v === 0 || v === 1 || v === 2,
    retain: flag,
  },
};
for (const action of ['added', 'removed', 'tested'])
  rules[`plugin.registry_${action}`] = { subject: 'plugin-registry', fields: registry };
for (const action of [
  'installed',
  'removed',
  'replaced',
  'spec_updated',
  'update_override_updated',
  'checked',
  'activation_completed',
])
  rules[`plugin.${action}`] = { subject: 'plugin-package', fields: pkg };
rules['plugin.update_policy_updated'] = { subject: 'plugin-policy', fields: policy };
rules['plugin.package_policy_updated'] = { subject: 'plugin-package', fields: pkg };
rules['plugin.zip_uploaded'] = {
  subject: 'plugin-package',
  fields: { pluginName: text, pluginVersion: text, restartRequested: flag },
};
rules['plugin.zip_deleted'] = {
  subject: 'plugin-package',
  fields: { pluginId: identifier, pluginName: text, pluginVersion: text, restartRequested: flag },
};
rules['plugin.retry_requested'] = {
  subject: 'plugin-package',
  fields: { pluginId: identifier, pluginName: text, pluginVersion: text, restartRequested: flag },
};
rules['plugin.restart_requested'] = {
  subject: 'plugin-system',
  fields: { pendingChanges: flag, restartRequested: flag },
};

export const ADMINISTRATION_AUDIT_ACTIONS = Object.keys(rules) as AdministrationAuditAction[];

export type AdministrationAuditAction =
  | 'settings.updated'
  | 'settings.api_key.generated'
  | 'settings.api_key.deleted'
  | `email_template.${'updated' | 'reset' | 'translations_set' | 'translations_deleted'}`
  | `email_layout.${'updated' | 'reset'}`
  | `mqtt_server.${'created' | 'updated' | 'deleted' | 'message_subscribe' | 'message_publish'}`
  | `plugin.registry_${'added' | 'removed' | 'tested'}`
  | `plugin.${
      | 'installed'
      | 'removed'
      | 'replaced'
      | 'spec_updated'
      | 'update_override_updated'
      | 'checked'
      | 'activation_completed'
      | 'update_policy_updated'
      | 'package_policy_updated'
      | 'zip_uploaded'
      | 'zip_deleted'
      | 'retry_requested'
      | 'restart_requested'}`;

/** Numeric grouping key for public string-keyed subjects; retain the original key in event details.
 * This persisted identifier hash is never a password hash; changing it would split audit history. */
export function auditSubjectKeyId(value: string): number {
  return Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 13), 16) || 1;
}

function administrationEventFields(input: AdministrationAuditInput): AdministrationAuditInput | null {
  if (!input || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return null;
  const source: Record<string, unknown> = {};
  const allowed = [
    'action',
    'actorId',
    'authenticationMethod',
    'apiTokenId',
    'subjectType',
    'subjectId',
    'outcome',
    'details',
    'operationId',
  ];
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !allowed.includes(key)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) return null;
    source[key] = descriptor.value;
  }
  return source as unknown as AdministrationAuditInput;
}

function administrationDetails(
  input: AdministrationAuditInput,
  rule: (typeof rules)[string],
): Record<string, string | number> | null {
  if (!input.details || ![Object.prototype, null].includes(Object.getPrototypeOf(input.details))) return null;
  const details: Record<string, string | number> = {};
  for (const key of Reflect.ownKeys(input.details)) {
    if (typeof key !== 'string' || !Object.hasOwn(rule.fields, key)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(input.details, key);
    if (!descriptor || !('value' in descriptor) || !rule.fields[key](descriptor.value)) return null;
    details[key] = descriptor.value;
  }
  return details;
}

/** What the host does without a user: installing a plugin update, restarting for it and reporting how it activated. */
const SYSTEM_ACTIONS: readonly string[] = [
  'plugin.replaced',
  'plugin.restart_requested',
  'plugin.activation_completed',
];

function validActor(input: AdministrationAuditInput): boolean {
  if (input.actorId !== null) return positive(input.actorId);
  return (
    SYSTEM_ACTIONS.includes(input.action) && input.authenticationMethod === undefined && input.apiTokenId === undefined
  );
}

export function projectAdministrationAuditEvent(input: AdministrationAuditInput): AdministrationAuditInput | null {
  try {
    const source = administrationEventFields(input);
    if (!source) return null;
    input = source;
    if (
      input.operationId !== undefined &&
      (typeof input.operationId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.operationId))
    )
      return null;
    const rule = rules[input.action];
    if (!rule || input.subjectType !== rule.subject || !validActor(input) || !positive(input.subjectId)) return null;
    const method = input.authenticationMethod ?? 'session';
    if (
      !isAuthenticationMethod(method) ||
      (method === 'api-token' && !positive(input.apiTokenId)) ||
      (method !== 'api-token' && input.apiTokenId !== undefined) ||
      (input.outcome !== undefined && !['succeeded', 'failed'].includes(input.outcome))
    )
      return null;
    const details = administrationDetails(input, rule);
    if (!details) return null;
    if (
      input.action === 'settings.updated' &&
      (!Object.hasOwn(details, 'settingKey') || !Object.hasOwn(details, 'before') || !Object.hasOwn(details, 'after'))
    )
      return null;
    if (
      input.action === 'settings.updated' &&
      ![details.before, details.after].every((value) => safeSettingValue(String(details.settingKey), value))
    )
      return null;
    if (Buffer.byteLength(JSON.stringify(details), 'utf8') > 4096) return null;
    return { ...input, details };
  } catch {
    return null;
  }
}

/** Audit values of the network restriction: IP ranges, a header name and role action lists, never free text. */
function safeNetworkRestrictionValue(key: string, value: string): boolean {
  if (key === 'networkRestriction.ipSource') return value === 'client' || value === 'header';
  if (key === 'networkRestriction.headerName') return NETWORK_RESTRICTION_HEADER_NAME_PATTERN.test(value);
  // A list too long for one value is recorded as what was removed and what was added; long values end in an ellipsis.
  if (key === 'networkRestriction.allowedRanges') return /^(?:(?:removed|added): )?[0-9A-Za-z:./%_,-]*…?$/.test(value);
  if (key === 'networkRestriction.roleActions') return /^[A-Za-z0-9_.-]+: [a-z.,]*…?$/.test(value);
  return false;
}

function safeSettingValue(key: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (key === 'app.defaultLanguage') return value === 'en' || value === 'de';
  if (key === 'resources.activityVisibility') return value === 'all' || value === 'introduced';
  if (key === 'resources.listVisibility') return value === 'authenticated' || value === 'permitted-only';
  if (key === 'attractap.cardWriterMode') return ['all', 'selected', 'secured'].includes(value);
  if (key === 'attractap.allowUidOnlyCards') return value === 'true' || value === 'false';
  if (key === 'attractap.cardWriterReaders') return /^(?:\d+(?:,\d+)*)?$/.test(value);
  if (key.startsWith('networkRestriction.') && !key.endsWith('.enabled'))
    return safeNetworkRestrictionValue(key, value);
  if (value === '') return true;
  if (['app.url', 'app.publicInternetUrl'].includes(key)) return value === safeAuditOrigin(value);
  if (key === 'smtp.host') return value === safeAuditHost(value);
  if (key === 'smtp.from') return value === 'configured' || value === safeAuditSender(value);
  if (key === 'smtp.service') return ['SMTP', 'Outlook365'].includes(value);
  if (key === 'audit.domains') return /^[a-z]+(?:,[a-z]+)*$/.test(value);
  if (/Configured$|Changed$|\.enabled$|\.secure$|\.exponentialBackoff$|^metrics\.toggles\./.test(key))
    return ['true', 'false', 'null'].includes(value);
  return /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));
}
