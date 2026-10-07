import { createHash } from 'crypto';
import { count, flag, identifier, locale, positive, text } from './audit-administration-checks';
import { mqtt, pkg, policy, registry, rules, template } from './audit-administration-rules';
import { safeAuditHost, safeAuditOrigin, safeAuditSender } from './audit-administration-safe-values';
import { AdministrationAuditEvent, PreviousAuditSettings } from './audit-administration-types';

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

/** Numeric grouping key for public string-keyed subjects; retain the original key in event details.
 * This persisted identifier hash is never a password hash; changing it would split audit history. */
export function auditSubjectKeyId(value: string): number {
  return Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 13), 16) || 1;
}

function administrationEventFields(input: AdministrationAuditEvent): AdministrationAuditEvent | null {
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
  return source as unknown as AdministrationAuditEvent;
}

function administrationDetails(
  input: AdministrationAuditEvent,
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

export function projectAdministrationAuditEvent(input: AdministrationAuditEvent): AdministrationAuditEvent | null {
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

export { SETTING_KEYS } from './audit-administration-rules';
export { safeAuditHost, safeAuditOrigin, safeAuditSender, safeRequestedSpec } from './audit-administration-safe-values';
export { AdministrationAuditEvent, PreviousAuditSettings } from './audit-administration-types';
