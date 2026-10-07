import { safeAuditHost, safeAuditOrigin, safeAuditSender } from '../audit/audit-administration-policy';
import { SystemSettingsDto } from './dto/system-settings.dto';
export function systemSettingChanges(
  before: SystemSettingsDto,
  after: SystemSettingsDto,
): Array<[string, string, string]> {
  const values = [
    ['app.url', safeAuditOrigin(before.app.url ?? ''), safeAuditOrigin(after.app.url ?? '')],
    [
      'app.publicInternetUrl',
      safeAuditOrigin(before.app.publicInternetUrl ?? ''),
      safeAuditOrigin(after.app.publicInternetUrl ?? ''),
    ],
    ['app.licenseKeyConfigured', before.app.licenseKeyConfigured, after.app.licenseKeyConfigured],
    ['smtp.service', before.smtp.service, after.smtp.service],
    ['smtp.host', safeAuditHost(before.smtp.host ?? ''), safeAuditHost(after.smtp.host ?? '')],
    ['smtp.port', before.smtp.port, after.smtp.port],
    ['smtp.secure', before.smtp.secure, after.smtp.secure],
    ['smtp.from', safeAuditSender(before.smtp.from ?? ''), safeAuditSender(after.smtp.from ?? '')],
    ['smtp.userConfigured', !!before.smtp.user, !!after.smtp.user],
    ['smtp.passConfigured', before.smtp.passConfigured, after.smtp.passConfigured],
  ] as const;
  return values
    .filter(
      ([key, oldValue, newValue]) =>
        oldValue !== newValue ||
        (key === 'app.url' && before.app.url !== after.app.url) ||
        (key === 'app.publicInternetUrl' && before.app.publicInternetUrl !== after.app.publicInternetUrl),
    )
    .map(([key, oldValue, newValue]) => [key, String(oldValue ?? ''), String(newValue ?? '')]);
}
