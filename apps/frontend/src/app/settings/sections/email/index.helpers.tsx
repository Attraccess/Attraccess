import { SmtpServiceType } from '@attraccess/react-query-client';
import type { SystemSettingsDto } from '@attraccess/react-query-client';

export function getSavedSmtpFields(settings: SystemSettingsDto | undefined) {
  const savedService =
    settings?.smtp.service === SmtpServiceType.OUTLOOK365 ? SmtpServiceType.OUTLOOK365 : SmtpServiceType.SMTP;
  const savedHost = settings?.smtp.host ?? '';
  const savedPort = settings?.smtp.port != null ? String(settings.smtp.port) : '';
  const savedSecure = settings?.smtp.secure ?? false;
  const savedUser = settings?.smtp.user ?? '';
  const savedFrom = settings?.smtp.from ?? '';
  return {
    service: savedService,
    host: savedHost,
    port: savedPort,
    secure: savedSecure,
    user: savedUser,
    from: savedFrom,
  };
}
export function validateSmtpFields(host: string, port: string, from: string, t: (key: string) => string) {
  const hostError = !host.trim() ? t('inputs.host.errors.required') : null;
  const portNumber = Number(port);
  const portError = !port.trim()
    ? t('inputs.port.errors.required')
    : !Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535
      ? t('inputs.port.errors.invalid')
      : null;
  const fromError = !from.trim() ? t('inputs.from.errors.required') : null;
  const hasError = !!(hostError || portError || fromError);
  return { hostError, portNumber, portError, fromError, hasError };
}
