import { AuditMetaDto } from '@attraccess/react-query-client';
import type { AuditDomain } from './audit-log-model.contracts';
export function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}
/** Locale-aware label from a plugin's declaration; callers fall back to i18n keys or humanize(). */
export function pluginDomainLabel(labels: Record<string, string> | undefined, language: string): string | undefined {
  if (!labels) return undefined;
  return labels[language] ?? labels[language?.slice(0, 2)] ?? labels.en;
}

/** Domains contributed by loaded plugins; the core UI never hardcodes a plugin domain. */
export function pluginDomains(meta: AuditMetaDto | undefined) {
  return meta?.domains.filter((domain) => domain.source === 'plugin') ?? [];
}
export function snapshot(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value === 'string') {
    try {
      return snapshot(JSON.parse(value));
    } catch {
      return { value };
    }
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { value };
}

export function toggleDomain(domains: AuditDomain[], domain: AuditDomain, selected: boolean): AuditDomain[] {
  return selected ? [...new Set([...domains, domain])] : domains.filter((value) => value !== domain);
}
/** Plugin domains record while registered unless disabled; toggling edits the blocklist. */
export function togglePluginDomain(disabled: string[], domain: string, selected: boolean): string[] {
  return selected ? disabled.filter((value) => value !== domain) : [...new Set([...disabled, domain])];
}
