import { useEffect } from 'react';

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

/** Keeps the screen from going to sleep while the wall is shown, where the browser allows it. */
export function useWakeLock(): void {
  useEffect(() => {
    const wakeLock = (navigator as { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let active = true;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      wakeLock
        .request('screen')
        .then((lock) => {
          if (active) sentinel = lock;
          else void lock.release();
        })
        .catch(() => undefined);
    };
    acquire();
    // The browser drops the lock whenever the page is hidden; take it again when it comes back.
    document.addEventListener('visibilitychange', acquire);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);
}
