import { createHash } from 'crypto';
import { EmailTemplateType } from '@attraccess/database-entities';
import { valid, validRange } from 'semver';

export interface AdministrationAuditEvent {
  action: string;
  operationId?: string;
  actorId: number;
  authenticationMethod?: 'session' | 'api-token';
  apiTokenId?: number;
  subjectType: string;
  subjectId: number;
  outcome?: 'succeeded' | 'failed';
  details: Record<string, string | number>;
}

type Check = (value: unknown) => boolean;
const text: Check = (v) =>
  typeof v === 'string' && v.length <= 256 && Array.from(v).every((character) => character.charCodeAt(0) >= 32);
const flag: Check = (v) => v === 0 || v === 1;
const enumeration =
  (...values: string[]): Check =>
  (v) =>
    typeof v === 'string' && values.includes(v);
const identifier: Check = (v) => typeof v === 'string' && /^[a-zA-Z0-9_.@/-]{1,214}$/.test(v);
const exactVersion: Check = (v) => typeof v === 'string' && v.length <= 100 && !!valid(v);
const spec: Check = (v) => typeof v === 'string' && v === safeRequestedSpec(v);
const origin: Check = (v) => typeof v === 'string' && v === safeAuditOrigin(v);
const count: Check = (v) => Number.isSafeInteger(v) && (v as number) >= 0;
const positive: Check = (v) => count(v) && (v as number) > 0;
const permissions: Check = (v) => {
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

export const SETTING_KEYS = [
  'app.url',
  'app.publicInternetUrl',
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

const settings = { settingKey: enumeration(...SETTING_KEYS), before: text, after: text };
const template = { templateType: enumeration(...Object.values(EmailTemplateType)) };
const locale: Check = (v) => typeof v === 'string' && /^[a-z]{2,3}(-[A-Z]{2,3})?$/.test(v);
const mqtt = {
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
const registry = { registryId: identifier, registryName: text, registryUrl: origin };
const policy = {
  checksEnabled: flag,
  updateMode: enumeration('off', 'patch', 'minor', 'follow'),
  maintenanceStartMinute: count,
  maintenanceDurationMinutes: count,
  prerelease: flag,
};
const pkg = {
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
const rules: Record<string, { subject: string; fields: Record<string, Check> }> = {
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
rules['plugin.zip_deleted'] = { subject: 'plugin-package', fields: { pluginId: identifier, restartRequested: flag } };
rules['plugin.retry_requested'] = {
  subject: 'plugin-package',
  fields: { pluginId: identifier, restartRequested: flag },
};

export const ADMINISTRATION_AUDIT_ACTIONS = Object.keys(rules);

export type PreviousAuditSettings = { enabled: boolean; domains: readonly string[] };

/** Numeric grouping key for public string-keyed subjects; retain the original key in event details.
 * This persisted identifier hash is never a password hash; changing it would split audit history. */
export function auditSubjectKeyId(value: string): number {
  return Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 13), 16) || 1;
}

export function projectAdministrationAuditEvent(input: AdministrationAuditEvent): AdministrationAuditEvent | null {
  try {
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
    input = source as unknown as AdministrationAuditEvent;
    if (
      input.operationId !== undefined &&
      (typeof input.operationId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.operationId))
    )
      return null;
    const rule = rules[input.action];
    if (!rule || input.subjectType !== rule.subject || !positive(input.actorId) || !positive(input.subjectId))
      return null;
    const method = input.authenticationMethod ?? 'session';
    if (
      !['session', 'api-token'].includes(method) ||
      (method === 'api-token' && !positive(input.apiTokenId)) ||
      (method === 'session' && input.apiTokenId !== undefined) ||
      (input.outcome !== undefined && !['succeeded', 'failed'].includes(input.outcome))
    )
      return null;
    if (!input.details || ![Object.prototype, null].includes(Object.getPrototypeOf(input.details))) return null;
    const details: Record<string, string | number> = {};
    for (const key of Reflect.ownKeys(input.details)) {
      if (typeof key !== 'string' || !Object.hasOwn(rule.fields, key)) return null;
      const descriptor = Object.getOwnPropertyDescriptor(input.details, key);
      if (!descriptor || !('value' in descriptor) || !rule.fields[key](descriptor.value)) return null;
      details[key] = descriptor.value;
    }
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

function safeSettingValue(key: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;
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

/** Await recording while preserving the successful primary operation even if a provider rejects. */
export async function recordAdministrationSafely(
  recorder: {
    recordAdministration(
      event: AdministrationAuditEvent,
      previousAuditSettings?: PreviousAuditSettings,
    ): Promise<unknown>;
  },
  event: AdministrationAuditEvent,
  previousAuditSettings?: PreviousAuditSettings,
): Promise<void> {
  try {
    await recorder.recordAdministration(event, previousAuditSettings);
  } catch {
    /* Never log exception payloads or request data. */
  }
}
