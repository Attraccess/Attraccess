import { useEffect, useRef } from 'react';
import { usePushNotifications } from '../../hooks/usePushNotifications';

export function GlobalPushNotifications({ enabled }: { enabled: boolean }) {
  const push = usePushNotifications();
  const hasAttemptedSubscribe = useRef(false);

  useEffect(() => {
    if (
      hasAttemptedSubscribe.current ||
      !enabled ||
      !push.isSupported ||
      push.isLoadingKey ||
      !push.publicKey ||
      push.isSubscribed ||
      push.isBusy
    ) {
      return;
    }

    hasAttemptedSubscribe.current = true;
    push.subscribe().catch(() => undefined);
  }, [enabled, push]);

  return null;
}
