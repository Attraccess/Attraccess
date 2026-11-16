import { Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useSettingsServiceGetMessagingRateLimitSettings } from '@attraccess/react-query-client';
import { SettingsSection } from '../../components/SettingsSection';
import { MessagingRateLimits } from './MessagingRateLimits';
import { MessagingVapidKeyAside } from './MessagingVapidKeyAside';
import { MessagingVapidKeyRows } from './MessagingVapidKeyRows';
import en from './en.json';
import de from './de.json';

/**
 * Messaging limits and the push transport.
 *
 * Only the four rate limits are form state, so they are what the save bar commits. Replacing the
 * VAPID key pair is destructive and irreversible — it invalidates every existing subscription — so
 * it keeps its own two-step confirmation instead of riding along on Save.
 */
export function MessagingSection() {
  const { t } = useTranslations({ en, de });
  const { isLoading } = useSettingsServiceGetMessagingRateLimitSettings();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        {t('loading')}
      </div>
    );
  }

  return (
    <SettingsSection title={t('title')} description={t('description')} aside={<MessagingVapidKeyAside />}>
      <MessagingRateLimits>
        <MessagingVapidKeyRows />
      </MessagingRateLimits>
    </SettingsSection>
  );
}

export default MessagingSection;
