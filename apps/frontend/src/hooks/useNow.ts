import { useEffect, useState } from 'react';

/** The current time, refreshed every `intervalMs` (every second by default), for clocks and live countdowns. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return now;
}
