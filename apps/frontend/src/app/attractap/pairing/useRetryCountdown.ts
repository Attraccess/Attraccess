import { useEffect, useState } from 'react';

const COUNTDOWN_TICK_MS = 250;

/** Counts down the wait the server asked for after too many attempts. */
export function useRetryCountdown() {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= deadline) setDeadline(null);
    }, COUNTDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, [deadline]);

  return {
    secondsLeft: deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000)),
    start: (seconds: number) => {
      const time = Date.now();
      setNow(time);
      setDeadline(time + seconds * 1000);
    },
  };
}
