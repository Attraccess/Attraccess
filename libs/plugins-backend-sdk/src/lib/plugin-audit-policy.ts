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
