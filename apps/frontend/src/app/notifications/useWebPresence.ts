// Reports the user's web presence (tab visible/hidden) to the backend so the
// backend can decide whether to deliver in-app toasts or fall back to push/email.
import { useEffect, useRef } from 'react';
import { useNotificationsServiceNotificationsUpdateWebPresence } from '@attraccess/react-query-client';

export function useWebPresence(enabled: boolean) {
  const reportedRef = useRef(false);
  const { mutate: reportPresence } = useNotificationsServiceNotificationsUpdateWebPresence({
    onError: () => {
      // Presence is deliberately best-effort and fire-and-forget.
    },
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Mark present on mount (assuming tab is visible initially)
    reportPresence({ requestBody: { present: document.visibilityState === 'visible' } });
    reportedRef.current = true;

    const handleVisibilityChange = () => {
      reportPresence({ requestBody: { present: document.visibilityState === 'visible' } });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Mark absent on unmount (user navigated away from the app)
      reportPresence({ requestBody: { present: false } });
    };
  }, [enabled, reportPresence]);
}
