import { getRegisteredPluginAuditDomains } from '../plugin-system/plugin-audit-registry';
import { ALL_CORE_AUDIT_ACTIONS, CORE_AUDIT_DOMAINS, CORE_SUBJECT_TYPES } from './audit-domains';

/**
 * The live audit vocabulary: core constants plus whatever the loaded plugins
 * registered. Query filters and the meta endpoint validate against these sets,
 * so the host never hardcodes a plugin's domains, actions or subject types.
 */

export function knownAuditDomains(): string[] {
  return [...CORE_AUDIT_DOMAINS, ...getRegisteredPluginAuditDomains().map(({ domain }) => domain)];
}

export function knownSubjectTypes(): string[] {
  const types = new Set<string>(CORE_SUBJECT_TYPES);
  for (const registered of getRegisteredPluginAuditDomains())
    for (const action of registered.actions.values())
      for (const subjectType of action.subjectTypes) types.add(subjectType);
  return [...types];
}

export function knownAuditActions(): string[] {
  const actions = new Set<string>(ALL_CORE_AUDIT_ACTIONS);
  for (const registered of getRegisteredPluginAuditDomains())
    for (const action of registered.actions.keys()) actions.add(action);
  return [...actions];
}

/** Leading action segments; every valid eventPrefix starts with one of these. */
export function knownEventPrefixes(): string[] {
  return [...new Set(knownAuditActions().map((action) => action.split('.')[0]))];
}
