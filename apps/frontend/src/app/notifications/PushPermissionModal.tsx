// Requests notification permission via an explicit user-interaction modal.
// iOS Safari/PWA requires a gesture to call Notification.requestPermission(),
// so auto-subscription on mount is not permitted — this modal bridges the gap.
import { useCallback, useEffect, useState } from 'react';
import { ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { Button } from '../../components/button';
import { StandardModal } from '../../components/standardModal';
import { usePushNotifications } from '../../hooks/usePushNotifications';

const DISMISSED_KEY = 'push-permission-dismissed';

export function PushPermissionModal({ enabled }: { enabled: boolean }) {
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
      sessionStorage.getItem(DISMISSED_KEY) === 'true'
    ) {
      return;
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      setIsOpen(true);
    }
  }, [enabled, push.isSupported, push.isLoadingKey, push.publicKey, push.isSubscribed, push.isBusy]);

  const handleAllow = useCallback(async () => {
    setIsOpen(false);
    await push.subscribe().catch(() => undefined);
  }, [push]);

  const handleDismiss = useCallback(() => {
    sessionStorage.setItem(DISMISSED_KEY, 'true');
    setIsOpen(false);
  }, []);

  return (
    <StandardModal isOpen={isOpen} onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      {({ close: _close }) => (
        <>
          <ModalHeader>Enable push notifications</ModalHeader>
          <ModalBody>
            <p className="text-sm text-default-600">
              Stay informed about resource sessions, access changes, and other events — even when the app is in the
              background.
            </p>
            <p className="text-sm text-default-600">Would you like to enable push notifications?</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onPress={handleDismiss}>
              Not now
            </Button>
            <Button variant="primary" onPress={handleAllow} isPending={push.isBusy}>
              Allow
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
