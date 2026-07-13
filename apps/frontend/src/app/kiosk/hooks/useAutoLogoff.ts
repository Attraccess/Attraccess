import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthenticationServiceEndSession } from '@attraccess/react-query-client';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'wheel', 'touchstart'] as const;
const WARNING_THRESHOLD_SECONDS = 60;

export interface AutoLogoffState {
  remaining: number | null;
  isWarning: boolean;
}

export function useAutoLogoff(seconds: number | null): AutoLogoffState {
  const [remaining, setRemaining] = useState<number | null>(seconds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingRef = useRef<number | null>(seconds);

  const { mutate: endSession } = useAuthenticationServiceEndSession({
    onSettled: () => window.location.reload(),
  });

  const reset = useCallback(() => {
    remainingRef.current = seconds;
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (!seconds || seconds <= 0) return;

    remainingRef.current = seconds;
    setRemaining(seconds);

    // User interaction keeps the session alive; inactivity drains the timer.
    // capture:true so non-bubbling 'scroll' events from nested scroll containers
    // (e.g. the kiosk's overflow-y-auto wrapper) still reach this window listener.
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true, capture: true }));

    timerRef.current = setInterval(() => {
      remainingRef.current = (remainingRef.current ?? seconds) - 1;
      setRemaining(remainingRef.current);

      if (remainingRef.current <= 0) {
        if (timerRef.current !== null) clearInterval(timerRef.current);
        endSession(undefined);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset, { capture: true }));
    };
  }, [seconds, reset, endSession]);

  if (!seconds || seconds <= 0) {
    return { remaining: null, isWarning: false };
  }

  return {
    remaining,
    isWarning: remaining !== null && remaining <= WARNING_THRESHOLD_SECONDS,
  };
}
