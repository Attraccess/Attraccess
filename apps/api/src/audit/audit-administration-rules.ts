import { EmailTemplateType } from '@attraccess/database-entities';
import {
  count,
  enumeration,
  exactVersion,
  flag,
  identifier,
  origin,
  permissions,
  spec,
  text,
} from './audit-administration-checks';
import { safeAuditHost } from './audit-administration-safe-values';
import { Check } from './audit-administration-types';

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
export const settings = { settingKey: enumeration(...SETTING_KEYS), before: text, after: text };
export const template = { templateType: enumeration(...Object.values(EmailTemplateType)) };
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
  updateMode: enumeration('off', 'patch', 'minor', 'follow'),
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
