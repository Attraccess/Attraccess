// Requests notification permission via an explicit user-interaction modal.
// iOS Safari/PWA requires a gesture to call Notification.requestPermission(),
// so auto-subscription on mount is not permitted — this modal bridges the gap.
import { useCallback, useEffect, useState } from 'react';
import { StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './permission.en.json';
import de from './permission.de.json';
import { useToastMessage } from '../../components/toastProvider';
import { usePushNotifications } from '../../hooks/usePushNotifications';

const DISMISSED_KEY = 'push-permission-dismissed';

function readDismissal(storage: 'localStorage' | 'sessionStorage', key: string): boolean {
  try {
    return window[storage].getItem(key) === 'true';
  } catch {
    return false;
  }
}

function persistDismissal(key: string) {
  try {
    localStorage.setItem(key, 'true');
  } catch {
    // Storage restrictions must not prevent consent or closing the prompt.
  }
}

export function PushPermissionModal({ enabled, userId }: { enabled: boolean; userId?: number }) {
  const { t } = useTranslations({ en, de });
  const dismissedKey = `${DISMISSED_KEY}:${userId ?? 'anonymous'}`;
  const push = usePushNotifications();
  const { error: showError } = useToastMessage();
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);

  useEffect(() => {
    if (
      !enabled ||
      !push.isSupported ||
      push.isLoadingKey ||
      !push.publicKey ||
      push.isSubscribed ||
      dismissedKeys.includes(dismissedKey) ||
      readDismissal('sessionStorage', DISMISSED_KEY) ||
      readDismissal('localStorage', dismissedKey)
    ) {
      setIsOpen(false);
      return;
    }

    setIsOpen(push.permission === 'default' || (failedKey === dismissedKey && push.permission === 'granted'));
  }, [
    enabled,
    push.isSupported,
    push.isLoadingKey,
    push.publicKey,
    push.isSubscribed,
    failedKey,
    push.permission,
    dismissedKey,
    dismissedKeys,
  ]);

  const handleDismiss = useCallback(() => {
    persistDismissal(dismissedKey);
    setDismissedKeys((keys) => (keys.includes(dismissedKey) ? keys : [...keys, dismissedKey]));
    setIsOpen(false);
  }, [dismissedKey]);

  const handleAllow = useCallback(async () => {
    try {
      if (await push.subscribe()) {
        handleDismiss();
        return;
      }
    } catch {
      // A browser or server failure is not a decision to dismiss future prompts.
    }
    setFailedKey(dismissedKey);
    showError({ title: t('subscribeFailed') });
  }, [push, dismissedKey, showError, t, handleDismiss]);

  return (
    <StatusDialog
      isOpen={isOpen}
      onClose={handleDismiss}
      status="info"
      title={t('title')}
      closeLabel={t('actions.defer')}
      action={{ label: t('actions.allow'), onPress: handleAllow, isPending: push.isBusy }}
    >
      <div className="flex flex-col gap-2">
        <p>{t('description')}</p>
        <p>{t('question')}</p>
      </div>
    </StatusDialog>
  );
}
