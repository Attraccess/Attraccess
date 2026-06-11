// Manages the browser push subscription lifecycle: permission, subscribe, unsubscribe.
// FEATURE: Push notifications for messages
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  usePushServicePushGetVapidPublicKey,
  usePushServicePushUpsertSubscription,
  usePushServicePushDeleteSubscription,
} from '@attraccess/react-query-client';

// The VAPID public key arrives base64url-encoded; PushManager.subscribe expects a Uint8Array.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getServiceWorkerRegistration(waitForReady = false): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }
  // The service worker is only registered in production builds; getRegistration (unlike .ready)
  // resolves immediately instead of hanging when none is registered.
  const registration = (await navigator.serviceWorker.getRegistration()) ?? null;
  if (registration || !waitForReady) {
    return registration;
  }

  return navigator.serviceWorker.ready;
}

export function usePushNotifications() {
  const isSupported = useMemo(
    () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    [],
  );

  const [permission, setPermission] = useState<NotificationPermission>(() =>
    isSupported ? Notification.permission : 'denied',
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const { data: vapidResponse, isLoading: isLoadingKey } = usePushServicePushGetVapidPublicKey();
  const publicKey = vapidResponse?.publicKey ?? null;

  const { mutateAsync: upsertSubscription } = usePushServicePushUpsertSubscription();
  const { mutateAsync: deleteSubscription } = usePushServicePushDeleteSubscription();

  // Reflect the current browser subscription state on mount.
  useEffect(() => {
    if (!isSupported) {
      return;
    }

    let cancelled = false;
    (async () => {
      const registration = await getServiceWorkerRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!cancelled) {
        setIsSubscribed(Boolean(subscription));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !publicKey) {
      return false;
    }

    setIsBusy(true);
    try {
      const currentPermission = await Notification.requestPermission();
      setPermission(currentPermission);
      if (currentPermission !== 'granted') {
        return false;
      }

      const registration = await getServiceWorkerRegistration(true);
      if (!registration) {
        return false;
      }

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        }));

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        return false;
      }

      await upsertSubscription({
        requestBody: {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          userAgent: navigator.userAgent,
        },
      });

      setIsSubscribed(true);
      return true;
    } finally {
      setIsBusy(false);
    }
  }, [isSupported, publicKey, upsertSubscription]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!isSupported) {
      return;
    }

    setIsBusy(true);
    try {
      const registration = await getServiceWorkerRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await deleteSubscription({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
    } finally {
      setIsBusy(false);
    }
  }, [isSupported, deleteSubscription]);

  return {
    isSupported,
    isLoadingKey,
    publicKey,
    permission,
    isSubscribed,
    isBusy,
    subscribe,
    unsubscribe,
  };
}
