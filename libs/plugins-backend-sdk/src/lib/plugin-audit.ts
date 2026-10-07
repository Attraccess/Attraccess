import { isPlainRecord, validateFieldPolicy } from './plugin-audit-field-validation';
import {
  PLUGIN_AUDIT_DOMAIN_PATTERN,
  PLUGIN_AUDIT_FIELD_PATTERN,
  PLUGIN_AUDIT_LIMITS,
  PLUGIN_AUDIT_SEGMENT_PATTERN,
  PluginAuditDomainDeclaration,
} from './plugin-audit-policy';

/** Implemented by the generic audit foundation, not by individual plugins. */
export const PLUGIN_AUDIT_HOST_PROVIDER = Symbol.for('attraccess.plugin.auditHostProvider');

export interface PluginAuditPrincipal {
  userId: number;
  authenticationMethod: 'session' | 'api-token';
  apiTokenId?: number;
}

export interface PluginAuditEvent {
  action: string;
  operationId: string;
  principal: PluginAuditPrincipal;
  outcome: 'attempted' | 'succeeded' | 'failed';
  subject: { type: string; id: number };
  /** Callers must project domain data through an explicit allowlist. */
  details: Readonly<Record<string, string | number | boolean | null>>;
}

/** Only `recorded` means the host durably accepted the event. */
export type PluginAuditReceipt = { status: 'recorded' } | { status: 'unavailable' };

export interface PluginAuditContext {
  record(event: PluginAuditEvent): Promise<PluginAuditReceipt>;
}

export interface PluginAuditHostProvider {
  record(event: PluginAuditEvent & { pluginId: string }): Promise<PluginAuditReceipt>;
}

const dottedName = (prefix: string, value: unknown, maxLength: number): boolean => {
  if (typeof value !== 'string' || value.length > maxLength || !value.startsWith(`${prefix}.`)) return false;
  const segments = value.slice(prefix.length + 1).split('.');
  return segments.length > 0 && segments.every((segment) => PLUGIN_AUDIT_SEGMENT_PATTERN.test(segment));
};

function validateDomainLabels(declaration: PluginAuditDomainDeclaration, prefix: string): void {
  if (declaration.labels !== undefined) {
    if (!isPlainRecord(declaration.labels)) throw new Error(`Audit domain "${prefix}": labels must be a plain object`);
    const locales = Object.keys(declaration.labels);
    if (locales.length > PLUGIN_AUDIT_LIMITS.labelLocales)
      throw new Error(`Audit domain "${prefix}": at most ${PLUGIN_AUDIT_LIMITS.labelLocales} label locales`);
    for (const locale of locales) {
      const label = declaration.labels[locale];
      if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale))
        throw new Error(`Audit domain "${prefix}": invalid label locale "${locale}"`);
      if (typeof label !== 'string' || label.trim().length === 0 || label.length > PLUGIN_AUDIT_LIMITS.labelLength)
        throw new Error(
          `Audit domain "${prefix}": label for "${locale}" must be 1-${PLUGIN_AUDIT_LIMITS.labelLength} characters`,
        );
    }
  }
}

/**
 * Validates one plugin-contributed audit domain declaration and returns it unchanged.
 * Throws a descriptive error on any violation; hosts quarantine the plugin in that case.
 * Cross-domain concerns (collisions with core or other plugins) are checked by the host registry.
 */
export function validatePluginAuditDomainDeclaration<T extends PluginAuditDomainDeclaration>(declaration: T): T {
  if (!isPlainRecord(declaration)) throw new Error('Audit domain declaration must be a plain object');
  const where = typeof declaration.domain === 'string' ? declaration.domain : '(unknown)';
  if (typeof declaration.domain !== 'string' || !PLUGIN_AUDIT_DOMAIN_PATTERN.test(declaration.domain))
    throw new Error(`Audit domain "${where}": domain must match ${PLUGIN_AUDIT_DOMAIN_PATTERN.source}`);
  const prefix = declaration.domain;
  validateDomainLabels(declaration, prefix);
  if (!Array.isArray(declaration.actions) || declaration.actions.length === 0)
    throw new Error(`Audit domain "${prefix}": actions must be a non-empty array`);
  if (declaration.actions.length > PLUGIN_AUDIT_LIMITS.actionsPerDomain)
    throw new Error(`Audit domain "${prefix}": at most ${PLUGIN_AUDIT_LIMITS.actionsPerDomain} actions`);
  const seenActions = new Set<string>();
  for (const entry of declaration.actions) {
    if (!isPlainRecord(entry)) throw new Error(`Audit domain "${prefix}": action policy must be a plain object`);
    const action = entry.action;
    if (typeof action !== 'string' || !dottedName(prefix, action, PLUGIN_AUDIT_LIMITS.actionLength))
      throw new Error(`Audit domain "${prefix}": action must be a "${prefix}."-prefixed dotted lowercase name`);
    if (seenActions.has(action)) throw new Error(`Audit domain "${prefix}": duplicate action "${action}"`);
    seenActions.add(action);
    const entryKeys = Object.keys(entry);
    for (const key of entryKeys)
      if (!['action', 'subjectTypes', 'details'].includes(key))
        throw new Error(`Audit domain "${prefix}", action "${action}": unknown property "${key}"`);
    if (!Array.isArray(entry.subjectTypes) || entry.subjectTypes.length === 0)
      throw new Error(`Audit domain "${prefix}", action "${action}": subjectTypes must be a non-empty array`);
    if (entry.subjectTypes.length > PLUGIN_AUDIT_LIMITS.subjectTypesPerAction)
      throw new Error(
        `Audit domain "${prefix}", action "${action}": at most ${PLUGIN_AUDIT_LIMITS.subjectTypesPerAction} subject types`,
      );
    const seenSubjects = new Set<string>();
    for (const subjectType of entry.subjectTypes) {
      if (!dottedName(prefix, subjectType, PLUGIN_AUDIT_LIMITS.actionLength))
        throw new Error(
          `Audit domain "${prefix}", action "${action}": subject type must be a "${prefix}."-prefixed dotted lowercase name`,
        );
      if (seenSubjects.has(subjectType))
        throw new Error(`Audit domain "${prefix}", action "${action}": duplicate subject type "${subjectType}"`);
      seenSubjects.add(subjectType);
    }
    if (entry.details !== undefined) {
      if (!isPlainRecord(entry.details))
        throw new Error(`Audit domain "${prefix}", action "${action}": details must be a plain object`);
      const fields = Object.keys(entry.details);
      if (fields.length > PLUGIN_AUDIT_LIMITS.fieldsPerAction)
        throw new Error(
          `Audit domain "${prefix}", action "${action}": at most ${PLUGIN_AUDIT_LIMITS.fieldsPerAction} detail fields`,
        );
      for (const field of fields) {
        if (!PLUGIN_AUDIT_FIELD_PATTERN.test(field))
          throw new Error(
            `Audit domain "${prefix}", action "${action}": detail field "${field}" must match ${PLUGIN_AUDIT_FIELD_PATTERN.source}`,
          );
        validateFieldPolicy(`Audit domain "${prefix}", action "${action}", field "${field}"`, entry.details[field]);
      }
    }
  }
  return declaration;
}

export {
  PLUGIN_AUDIT_DOMAIN_PATTERN,
  PLUGIN_AUDIT_FIELD_PATTERN,
  PLUGIN_AUDIT_LIMITS,
  PLUGIN_AUDIT_SEGMENT_PATTERN,
  PluginAuditActionPolicy,
  PluginAuditDomainDeclaration,
  PluginAuditFieldPolicy,
} from './plugin-audit-policy';
