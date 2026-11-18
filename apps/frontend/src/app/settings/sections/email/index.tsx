import { useState } from 'react';
import { Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useGetSystemSettings } from '@attraccess/react-query-client';
import { SettingsSection } from '../../components/SettingsSection';
import { EmailSmtpForm, SmtpDraft } from './EmailSmtpForm';
import { EmailStatusAside } from './EmailStatusAside';
import en from './en.json';
import de from './de.json';

/**
 * Outgoing mail. Templates and the shared layout are sub-routes rather than panels — both are
 * full-screen editors, not settings — so this section is only the SMTP transport.
 */
export function EmailSection() {
  const { t } = useTranslations({ en, de });
  // One subscription, passed down: the form and the aside subscribing after the gate refetched the
  // settings on mount (the shared client has no `staleTime`).
  const { data: settings, isLoading } = useGetSystemSettings();
  // Above the gate, so a refetch after a failed load (back to loading, form unmounted) keeps the edit.
  const [draft, setDraft] = useState<SmtpDraft>({});
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        {t('loading')}
      </div>
    );
  }

  return (
    <SettingsSection
      title={t('title')}
      description={t('description')}
      aside={<EmailStatusAside passConfigured={settings?.smtp.passConfigured} />}
    >
      <EmailSmtpForm
        settings={settings}
        draft={draft}
        setDraft={setDraft}
        hasAttemptedSave={hasAttemptedSave}
        setHasAttemptedSave={setHasAttemptedSave}
      />
    </SettingsSection>
  );
}

export default EmailSection;
