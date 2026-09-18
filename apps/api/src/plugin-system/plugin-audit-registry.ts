/**
 * Module-level singleton registry for plugin-contributed audit domains.
 *
 * Populated during AppModule initialisation (PluginModule.forRoot), before the
 * NestJS DI container starts — the same pattern used by plugin-flow-node-registry.
 * AuditService and the audit query/meta surfaces import the getters directly.
 *
 * A plugin declaration is validated twice: the SDK validator enforces the
 * declaration shape, and this registry enforces host-level uniqueness (no core
 * domain collisions, no cross-plugin collisions). Declarations are compiled
 * into lookup maps once, so event projection never recompiles a regex.
 */

import {
  PluginAuditDomainDeclaration,
  PLUGIN_AUDIT_DOMAIN_PATTERN,
  validatePluginAuditDomainDeclaration,
} from '@attraccess/plugins-backend-sdk';
import { CORE_AUDIT_DOMAINS } from '../audit/audit-domains';

export interface CompiledPluginAuditField {
  readonly type: 'string' | 'number' | 'boolean';
  readonly regex?: RegExp;
  readonly oneOf?: ReadonlySet<string | number>;
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
  readonly maxLength?: number;
}

export interface CompiledPluginAuditAction {
  readonly action: string;
  readonly subjectTypes: ReadonlySet<string>;
  readonly fields: ReadonlyMap<string, CompiledPluginAuditField>;
}

export interface CompiledPluginAuditDomain {
  readonly domain: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly pluginName: string;
  /** Manifest id stamped onto every audit event recorded through the plugin context. */
  readonly pluginId: string;
  readonly actions: ReadonlyMap<string, CompiledPluginAuditAction>;
}

const _domains = new Map<string, CompiledPluginAuditDomain>();

function compileField(policy: {
  type: 'string' | 'number' | 'boolean';
  pattern?: string;
  oneOf?: readonly (string | number)[];
  min?: number;
  max?: number;
  integer?: boolean;
  maxLength?: number;
}): CompiledPluginAuditField {
  return {
    type: policy.type,
    ...(policy.pattern !== undefined ? { regex: new RegExp(`^(?:${policy.pattern})$`) } : {}),
    ...(policy.oneOf !== undefined ? { oneOf: new Set<string | number>(policy.oneOf) } : {}),
    ...(policy.min !== undefined ? { min: policy.min } : {}),
    ...(policy.max !== undefined ? { max: policy.max } : {}),
    ...(policy.integer !== undefined ? { integer: policy.integer } : {}),
    ...(policy.maxLength !== undefined ? { maxLength: policy.maxLength } : {}),
  };
}

/** Called by PluginModule once per plugin that declares auditDomains. Throws on invalid or colliding declarations. */
export function registerPluginAuditDomains(
  plugin: { name: string; id: string },
  declarations: PluginAuditDomainDeclaration[],
): void {
  if (!/^[a-zA-Z0-9_-]{21}$/.test(plugin.id))
    throw new Error(`Plugin "${plugin.name}" has an invalid manifest id; cannot own audit domains.`);
  const compiled: Array<[string, CompiledPluginAuditDomain]> = [];
  for (const declaration of declarations) {
    validatePluginAuditDomainDeclaration(declaration);
    const domain = declaration.domain;
    if ((CORE_AUDIT_DOMAINS as readonly string[]).includes(domain))
      throw new Error(`Plugin "${plugin.name}" declared audit domain "${domain}", which is reserved for the host.`);
    if (!PLUGIN_AUDIT_DOMAIN_PATTERN.test(domain))
      throw new Error(`Plugin "${plugin.name}" declared an invalid audit domain "${domain}".`);
    const existing = _domains.get(domain) ?? compiled.find(([key]) => key === domain)?.[1];
    if (existing)
      throw new Error(
        `Plugin audit domain "${domain}" is already registered by plugin "${existing.pluginName}". ` +
          `Domains must be unique across all plugins.`,
      );
    const actions = new Map<string, CompiledPluginAuditAction>();
    for (const entry of declaration.actions) {
      const fields = new Map<string, CompiledPluginAuditField>();
      for (const [name, policy] of Object.entries(entry.details ?? {})) fields.set(name, compileField(policy));
      actions.set(entry.action, {
        action: entry.action,
        subjectTypes: new Set(entry.subjectTypes),
        fields,
      });
    }
    compiled.push([
      domain,
      {
        domain,
        labels: { ...(declaration.labels ?? {}) },
        pluginName: plugin.name,
        pluginId: plugin.id,
        actions,
      },
    ]);
  }
  // Register only after every declaration validated, so a rejected plugin contributes nothing.
  for (const [domain, entry] of compiled) _domains.set(domain, entry);
}

/** O(1) lookup of a compiled plugin audit domain by name. */
export function getPluginAuditDomain(domain: string): CompiledPluginAuditDomain | undefined {
  return _domains.get(domain);
}

/** All plugin-registered audit domains, in registration order. */
export function getRegisteredPluginAuditDomains(): CompiledPluginAuditDomain[] {
  return Array.from(_domains.values());
}

/** Test helper: drops every registered plugin audit domain. */
export function resetPluginAuditRegistry(): void {
  _domains.clear();
}
