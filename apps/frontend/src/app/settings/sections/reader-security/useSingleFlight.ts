import { useRef } from 'react';

/**
 * Lets only one key request run at a time. A mutation's `isPending` only reaches the button after a
 * render, so a fast double press would otherwise send the request twice; for key creation that
 * means a second key pair silently replacing the first.
 *
 * The guard waits on the request's own promise (`mutateAsync`), not on per-call `onSettled`
 * callbacks: those belong to the mutation observer, and `reset()` (run when a dialog opens) detaches
 * it, so a request still running at that point would never release the guard.
 */
export function useSingleFlight() {
  const busy = useRef(false);
  return (start: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true;
    start()
      // The mutation's own `error` and `onError` report the failure; the guard only needs to release.
      .catch(() => undefined)
      .finally(() => {
        busy.current = false;
      });
  };
}
