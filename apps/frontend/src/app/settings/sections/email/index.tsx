import { Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useSettingsServiceGetSystemSettings } from '@attraccess/react-query-client';
import { SettingsSection } from '../../components/SettingsSection';
import { EmailSmtpForm } from './EmailSmtpForm';
import { EmailStatusAside } from './EmailStatusAside';
import en from './en.json';
import de from './de.json';

/**
 * Outgoing mail. Templates and the shared layout are sub-routes rather than panels — both are
 * full-screen editors, not settings — so this section is only the SMTP transport.
 */
export function EmailSection() {
  const { t } = useTranslations({ en, de });
  const { isLoading } = useSettingsServiceGetSystemSettings();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        {t('loading')}
      </div>
    );
  }

  return (
    <SettingsSection title={t('title')} description={t('description')} aside={<EmailStatusAside />}>
      <EmailSmtpForm />
    </SettingsSection>
  );
}

export default EmailSection;
