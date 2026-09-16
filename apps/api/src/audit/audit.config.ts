import { ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { SettingsStoreService } from '../settings/settings-store.service';
import { AUDIT_DOMAIN_QUERY_PATTERN, CORE_AUDIT_DOMAINS } from './audit-domains';

const fields = {
  enabled: z.boolean(),
  /** Allowlist of core domains. Plugin-contributed domains are never stored here. */
  domains: z.array(z.enum(CORE_AUDIT_DOMAINS)).max(CORE_AUDIT_DOMAINS.length),
  /**
   * Blocklist of plugin-contributed domains an administrator turned off. A registered
   * plugin domain records while it is absent from this list, so plugin installs work
   * without seeding per-plugin defaults into core settings.
   */
  plugin_domains_disabled: z.array(z.string().regex(AUDIT_DOMAIN_QUERY_PATTERN)).max(64),
  retention_days: z.number().int().min(1).max(3650),
};
export const auditSettingsUpdateSchema = z.object(fields).partial().strict();
export const auditSettingsSchema = z
  .object({
    enabled: fields.enabled.default(true),
    domains: fields.domains.default(['administration', 'attractap', 'identity', 'project', 'resource', 'sso']),
    plugin_domains_disabled: fields.plugin_domains_disabled.default([]),
    retention_days: fields.retention_days.default(90),
  })
  .strict();
export type AuditSettings = z.infer<typeof auditSettingsSchema>;

export async function readAuditSettings(store: SettingsStoreService): Promise<AuditSettings> {
  try {
    const [enabled, domains, pluginDomainsDisabled, retention] = await Promise.all(
      ['enabled', 'domains', 'plugin_domains_disabled', 'retention_days'].map((key) =>
        store.getPlainSetting('audit', key),
      ),
    );
    const parse = (value: string | null | undefined) => (value == null ? undefined : JSON.parse(value));
    return auditSettingsSchema.parse({
      enabled: parse(enabled),
      domains: parse(domains),
      plugin_domains_disabled: parse(pluginDomainsDisabled),
      retention_days: parse(retention),
    });
  } catch {
    throw new ServiceUnavailableException('Audit settings unavailable');
  }
}
