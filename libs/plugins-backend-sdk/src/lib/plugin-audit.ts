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

/**
 * Declarative audit policy a plugin contributes through `PluginBackendModule.auditDomains`.
 * The host registers the declaration, then enforces it on every event the plugin records:
 * only declared actions, subject types and detail fields are accepted, so a plugin can
 * never write arbitrary JSON into the audit log. The host additionally applies generic
 * bounds (identifier shapes, detail size) and rejects events whose pluginId does not own
 * the domain.
 */

/** Domain identifiers are lowercase snake_case and prefix every action and subject type. */
export const PLUGIN_AUDIT_DOMAIN_PATTERN = /^[a-z][a-z_]{0,31}$/;
/** One dot-separated segment of an action or subject type name. */
export const PLUGIN_AUDIT_SEGMENT_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
/** Detail field name: camelCase segments, optionally dot-prefixed (e.g. `before.count`). */
export const PLUGIN_AUDIT_FIELD_PATTERN = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*$/;

export const PLUGIN_AUDIT_LIMITS = {
  domainsPerPlugin: 4,
  actionsPerDomain: 64,
  subjectTypesPerAction: 8,
  fieldsPerAction: 32,
  oneOfEntries: 64,
  patternLength: 512,
  maxLengthCeiling: 4096,
  labelLocales: 8,
  labelLength: 120,
  actionLength: 128,
} as const;

export interface PluginAuditFieldPolicy {
  readonly type: 'string' | 'number' | 'boolean';
  /** Full-match regex source; the host anchors it. Strings only. */
  readonly pattern?: string;
  /** Closed value set; entries must match `type`. */
  readonly oneOf?: readonly (string | number)[];
  /** Inclusive numeric bounds. Numbers only. */
  readonly min?: number;
  readonly max?: number;
  /** Reject non-integers. Numbers only. */
  readonly integer?: boolean;
  /** Inclusive UTF-16 code-unit bound. Strings only. */
  readonly maxLength?: number;
}

export interface PluginAuditActionPolicy {
  /** Full action name; must start with `${domain}.`. */
  readonly action: string;
  /** Subject types accepted for this action; each must start with `${domain}.`. */
  readonly subjectTypes: readonly string[];
  /** Allowed detail fields. Events carrying any other field are rejected. */
  readonly details?: Readonly<Record<string, PluginAuditFieldPolicy>>;
}

export interface PluginAuditDomainDeclaration {
  /** Lowercase identifier; becomes the audit domain and the action/subject-type prefix. */
  readonly domain: string;
  /** Optional human-readable domain labels keyed by locale (e.g. `{ en: 'Demo devices' }`). */
  readonly labels?: Readonly<Record<string, string>>;
  readonly actions: readonly PluginAuditActionPolicy[];
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const dottedName = (prefix: string, value: unknown, maxLength: number): boolean => {
  if (typeof value !== 'string' || value.length > maxLength || !value.startsWith(`${prefix}.`)) return false;
  const segments = value.slice(prefix.length + 1).split('.');
  return segments.length > 0 && segments.every((segment) => PLUGIN_AUDIT_SEGMENT_PATTERN.test(segment));
};

function validateFieldPolicy(path: string, policy: unknown): void {
  if (!isPlainRecord(policy)) throw new Error(`${path}: field policy must be a plain object`);
  const declared = policy.type;
  if (declared !== 'string' && declared !== 'number' && declared !== 'boolean')
    throw new Error(`${path}: field type must be 'string', 'number' or 'boolean'`);
  const keys = Object.keys(policy);
  for (const key of keys)
    if (!['type', 'pattern', 'oneOf', 'min', 'max', 'integer', 'maxLength'].includes(key))
      throw new Error(`${path}: unknown field policy property "${key}"`);
  if (policy.pattern !== undefined) {
    if (declared !== 'string') throw new Error(`${path}: pattern requires type 'string'`);
    if (typeof policy.pattern !== 'string' || policy.pattern.length > PLUGIN_AUDIT_LIMITS.patternLength)
      throw new Error(`${path}: pattern must be a string of at most ${PLUGIN_AUDIT_LIMITS.patternLength} characters`);
    try {
      new RegExp(policy.pattern);
    } catch {
      throw new Error(`${path}: pattern is not a valid regular expression`);
    }
  }
  if (policy.oneOf !== undefined) {
    const entries = policy.oneOf;
    if (
      !Array.isArray(entries) ||
      entries.length === 0 ||
      entries.length > PLUGIN_AUDIT_LIMITS.oneOfEntries ||
      entries.some((entry) => typeof entry !== declared)
    )
      throw new Error(`${path}: oneOf must be 1-${PLUGIN_AUDIT_LIMITS.oneOfEntries} values of type '${declared}'`);
  }
  for (const bound of ['min', 'max'] as const)
    if (policy[bound] !== undefined) {
      if (declared !== 'number' || typeof policy[bound] !== 'number' || !Number.isFinite(policy[bound] as number))
        throw new Error(`${path}: ${bound} requires a finite number and type 'number'`);
    }
  if (policy.integer !== undefined) {
    if (declared !== 'number' || typeof policy.integer !== 'boolean')
      throw new Error(`${path}: integer requires a boolean and type 'number'`);
  }
  if (policy.maxLength !== undefined) {
    if (
      declared !== 'string' ||
      typeof policy.maxLength !== 'number' ||
      !Number.isSafeInteger(policy.maxLength) ||
      policy.maxLength < 1 ||
      policy.maxLength > PLUGIN_AUDIT_LIMITS.maxLengthCeiling
    )
      throw new Error(`${path}: maxLength requires an integer 1-${PLUGIN_AUDIT_LIMITS.maxLengthCeiling} and type 'string'`);
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
        throw new Error(`Audit domain "${prefix}": label for "${locale}" must be 1-${PLUGIN_AUDIT_LIMITS.labelLength} characters`);
    }
  }
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
        throw new Error(`Audit domain "${prefix}", action "${action}": at most ${PLUGIN_AUDIT_LIMITS.fieldsPerAction} detail fields`);
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
