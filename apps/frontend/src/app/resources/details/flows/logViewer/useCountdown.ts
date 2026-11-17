import { useEffect, useState } from 'react';

/** Time left until `until` as `m:ss` or `h:mm:ss`, ticking every second; null without a deadline. */
export function useCountdown(until: Date | string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!until) {
      return;
    }

    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [until]);

  if (!until) {
    return null;
  }

  const remainingSeconds = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
