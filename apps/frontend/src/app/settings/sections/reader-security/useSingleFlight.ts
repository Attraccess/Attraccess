import { useRef } from 'react';

/**
 * Lets only one key request run at a time. A mutation's `isPending` only reaches the button after a
 * render, so a fast double press would otherwise send the request twice; for key creation that
 * means a second key pair silently replacing the first.
 */
export function useSingleFlight() {
  const busy = useRef(false);
  return (start: (settle: () => void) => void) => {
    if (busy.current) return;
    busy.current = true;
    start(() => {
      busy.current = false;
    });
  };
}
