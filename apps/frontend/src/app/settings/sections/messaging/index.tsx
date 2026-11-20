import { useState } from 'react';
import { Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { usePushGetVapidConfig, useGetMessagingRateLimitSettings } from '@attraccess/react-query-client';
import { SettingsSection } from '../../components/SettingsSection';
import { MessagingRateLimits } from './MessagingRateLimits';
import { MessagingVapidKeyAside } from './MessagingVapidKeyAside';
import { MessagingVapidKeyRows } from './MessagingVapidKeyRows';
import { EMPTY_VAPID_KEY_DRAFT, VapidKeyDraft } from './vapidKeyDraft';
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
  // Both queries start here, in parallel, and reach the rows as props: subscribing in the rows
  // delayed VAPID until the limits arrived and refetched the limits on mount (no `staleTime`).
  const { data: limits, isLoading } = useGetMessagingRateLimitSettings();
  const { data: vapidConfig } = usePushGetVapidConfig();
  // Above the gate: a limits refetch after an error flips back to loading and unmounts the rows.
  const [vapidDraft, setVapidDraft] = useState<VapidKeyDraft>(EMPTY_VAPID_KEY_DRAFT);

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
      aside={<MessagingVapidKeyAside vapidConfig={vapidConfig} />}
    >
      <MessagingRateLimits limits={limits}>
        <MessagingVapidKeyRows
          subscriptionCount={vapidConfig?.subscriptionCount ?? 0}
          draft={vapidDraft}
          onDraftChange={setVapidDraft}
        />
      </MessagingRateLimits>
    </SettingsSection>
  );
}

export default MessagingSection;
