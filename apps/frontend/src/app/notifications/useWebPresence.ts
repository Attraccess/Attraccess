// Reports the user's web presence (tab visible/hidden) to the backend so the
// backend can decide whether to deliver in-app toasts or fall back to push/email.
import { useEffect, useRef } from 'react';
import { getBaseUrl } from '../../api';

async function reportPresence(present: boolean): Promise<void> {
  try {
    await fetch(`${getBaseUrl()}/api/notifications/web-presence`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ present }),
    });
  } catch {
    // Fire-and-forget — ignore network errors
  }
}

export function useWebPresence(enabled: boolean) {
  const reportedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Mark present on mount (assuming tab is visible initially)
    reportPresence(document.visibilityState === 'visible');
    reportedRef.current = true;

    const handleVisibilityChange = () => {
      reportPresence(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Mark absent on unmount (user navigated away from the app)
      reportPresence(false);
    };
  }, [enabled]);
}
