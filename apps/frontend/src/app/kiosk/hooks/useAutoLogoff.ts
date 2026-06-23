import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthenticationServiceEndSession } from '@attraccess/react-query-client';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const;
const WARNING_THRESHOLD_SECONDS = 60;

export interface AutoLogoffState {
  remaining: number | null;
  isWarning: boolean;
}

export function useAutoLogoff(seconds: number | null): AutoLogoffState {
  const [remaining, setRemaining] = useState<number | null>(seconds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingRef = useRef<number | null>(seconds);
  const isPausedRef = useRef(false);

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

    const handleActivity = () => {
      if (!isPausedRef.current) {
        reset();
      }
    };

    // pause timer while form is submitting
    const handleSubmit = () => {
      isPausedRef.current = true;
    };
    const handleSubmitEnd = () => {
      isPausedRef.current = false;
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }));
    window.addEventListener('submit', handleSubmit);
    window.addEventListener('formdata', handleSubmitEnd);

    timerRef.current = setInterval(() => {
      if (isPausedRef.current) return;

      remainingRef.current = (remainingRef.current ?? seconds) - 1;
      setRemaining(remainingRef.current);

      if (remainingRef.current <= 0) {
        clearInterval(timerRef.current!);
        endSession(undefined);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, handleActivity));
      window.removeEventListener('submit', handleSubmit);
      window.removeEventListener('formdata', handleSubmitEnd);
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
