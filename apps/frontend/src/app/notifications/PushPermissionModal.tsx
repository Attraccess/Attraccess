// Requests notification permission via an explicit user-interaction modal.
// iOS Safari/PWA requires a gesture to call Notification.requestPermission(),
// so auto-subscription on mount is not permitted — this modal bridges the gap.
import { useCallback, useEffect, useState } from 'react';
import { ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { Button } from '../../components/button';
import { StandardModal } from '../../components/standardModal';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './permission.en.json';
import de from './permission.de.json';
import { usePushNotifications } from '../../hooks/usePushNotifications';

const DISMISSED_KEY = 'push-permission-dismissed';

export function PushPermissionModal({ enabled, userId }: { enabled: boolean; userId?: number }) {
  const { t } = useTranslations({ en, de });
  const dismissedKey = `${DISMISSED_KEY}:${userId ?? 'anonymous'}`;
  const push = usePushNotifications();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (
      !enabled ||
      !push.isSupported ||
      push.isLoadingKey ||
      !push.publicKey ||
      push.isSubscribed ||
      push.isBusy ||
      sessionStorage.getItem(DISMISSED_KEY) === 'true' ||
      localStorage.getItem(dismissedKey) === 'true'
    ) {
      setIsOpen(false);
      return;
    }

    setIsOpen(push.permission === 'default');
  }, [
    enabled,
    push.isSupported,
    push.isLoadingKey,
    push.publicKey,
    push.isSubscribed,
    push.isBusy,
    push.permission,
    dismissedKey,
  ]);

  const handleAllow = useCallback(async () => {
    localStorage.setItem(dismissedKey, 'true');
    setIsOpen(false);
    await push.subscribe().catch(() => undefined);
  }, [push, dismissedKey]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(dismissedKey, 'true');
    setIsOpen(false);
  }, [dismissedKey]);

  return (
    <StandardModal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) handleDismiss();
      }}
    >
      {({ close: _close }) => (
        <>
          <ModalHeader>{t('title')}</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-600">{t('description')}</p>
            <p className="text-sm text-default-600">{t('question')}</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onPress={handleDismiss}>
              {t('actions.defer')}
            </Button>
            <Button variant="primary" onPress={handleAllow} isPending={push.isBusy}>
              {t('actions.allow')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
