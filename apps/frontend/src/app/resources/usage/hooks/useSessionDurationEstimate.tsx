import { useCallback, useEffect, useRef, useState } from 'react';
import { useGetOneResourceById } from '@attraccess/react-query-client';
import { SessionDurationEstimateDialog } from '../components/SessionDurationEstimateDialog';

/**
 * Asks for the duration estimate of a start when the machine requires one. `ask()` resolves with the minutes, with
 * `undefined` when nothing is required (the start goes ahead without one), or with `null` when the user cancelled.
 * Every web start (start, takeover, QR link, supervised start) asks first and keeps the answer in its request body,
 * so the forms and plugin-confirmation retries send it again. Render `dialog` next to the start control.
 */
export function useSessionDurationEstimate(resourceId: number) {
  const { data: resource } = useGetOneResourceById({ path: { id: resourceId } });
  const [isOpen, setIsOpen] = useState(false);
  const resolver = useRef<((value: number | null) => void) | null>(null);
  const required = resource?.type === 'machine' && resource.requireSessionDurationEstimate === true;
  const maxMinutes = resource?.maxSessionDurationMinutes ?? null;

  const settle = useCallback((value: number | null) => {
    resolver.current?.(value);
    resolver.current = null;
    setIsOpen(false);
  }, []);

  // A caller that unmounts while the dialog is open must not leave its start hanging.
  useEffect(() => () => resolver.current?.(null), []);

  const askNow = useCallback((): Promise<number | null | undefined> => {
    if (!required) return Promise.resolve(undefined);
    resolver.current?.(null);
    return new Promise((resolve) => {
      resolver.current = resolve;
      setIsOpen(true);
    });
  }, [required]);
  const askNowRef = useRef(askNow);
  askNowRef.current = askNow;

  // A start right after the page opened (QR link) may come before the resource is loaded: wait for its settings.
  const waiting = useRef<Array<() => void>>([]);
  useEffect(() => {
    if (resource) waiting.current.splice(0).forEach((resume) => resume());
  }, [resource]);
  const ask = useCallback(
    (): Promise<number | null | undefined> =>
      resource
        ? askNow()
        : new Promise((resolve) => {
            waiting.current.push(() => void askNowRef.current().then(resolve));
          }),
    [askNow, resource],
  );

  const dialog = (
    <SessionDurationEstimateDialog
      isOpen={isOpen}
      maxMinutes={maxMinutes}
      onConfirm={settle}
      onCancel={() => settle(null)}
    />
  );

  return { ask, dialog, required } as const;
}
