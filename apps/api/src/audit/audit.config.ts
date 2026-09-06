import { ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { SettingsStoreService } from '../settings/settings-store.service';

const fields = {
  enabled: z.boolean(),
  domains: z.array(z.literal('wago')).max(1),
  retention_days: z.number().int().min(1).max(3650),
};
export const auditSettingsUpdateSchema = z.object(fields).partial().strict();
export const auditSettingsSchema = z
  .object({
    enabled: fields.enabled.default(true),
    domains: fields.domains.default(['wago']),
    retention_days: fields.retention_days.default(90),
  })
  .strict();

export async function readAuditSettings(store: SettingsStoreService) {
  try {
    const [enabled, domains, retention] = await Promise.all(
      ['enabled', 'domains', 'retention_days'].map((key) => store.getPlainSetting('audit', key)),
    );
    return auditSettingsSchema.parse({
      enabled: enabled === null ? undefined : JSON.parse(enabled),
      domains: domains === null ? undefined : JSON.parse(domains),
      retention_days: retention === null ? undefined : JSON.parse(retention),
    });
  } catch {
    throw new ServiceUnavailableException('Audit settings unavailable');
  }
}
