import { useCallback, useRef } from 'react';
import {
  ApiError,
  StartUsageSessionDto,
  useResourcesServiceResourceUsageStartSession,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import { getConfirmationRequired, getStartBlockedReason, useStartConfirmation } from './useStartConfirmation';

export type StartErrorHandler = (error: ApiError, requestBody: StartUsageSessionDto) => void;

interface Options {
  onSuccess: (requestBody: StartUsageSessionDto) => void;
  /** Errors that are neither a plugin confirmation nor a plugin block. */
  onError: StartErrorHandler;
  /** The plugin confirmation or block notice just appeared, e.g. to close the caller's own modal. */
  onPluginNotice?: () => void;
}

/** A plugin confirmation or block: shown by the mounted start control, never as a generic error. */
const isPluginStartError = (error: unknown) =>
  getConfirmationRequired(error) !== null || getStartBlockedReason(error) !== null;

/**
 * Starts a session through the plugin pre-start contract. A 409 CONFIRMATION_REQUIRED opens the plugin's
 * confirmation and retries with its step id; a 403 START_BLOCKED shows the plugin's reason as written.
 * Every web start (start, takeover, QR link) goes through here; render `dialog` next to the start control.
 *
 * `onSuccess` and `onError` are hook-level mutation callbacks, so they still run when the caller unmounts
 * before the reply (the session-started event can swap the start control out first). Only the plugin
 * confirmation, the block notice and the per-call error handler need the caller mounted.
 */
export function useStartSessionWithConfirmation(resourceId: number, options: Options) {
  const toast = useToastMessage();
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const { mutate, isPending } = useResourcesServiceResourceUsageStartSession({
    onSuccess: (_data, { requestBody }) => optionsRef.current.onSuccess(requestBody),
    onError: (error, { requestBody }) => {
      if (!isPluginStartError(error)) optionsRef.current.onError(error as ApiError, requestBody);
    },
  });
  // Per-call error handler of the last start, kept for the confirmed retry (e.g. the missing-forms retry).
  const callErrorRef = useRef<StartErrorHandler | undefined>(undefined);
  const startRef = useRef<(requestBody: StartUsageSessionDto, onCallError?: StartErrorHandler) => void>(
    () => undefined,
  );
  const confirmation = useStartConfirmation<StartUsageSessionDto>((requestBody) =>
    startRef.current(requestBody, callErrorRef.current),
  );
  const { handleStartError } = confirmation;

  const start = useCallback(
    (requestBody: StartUsageSessionDto, onCallError?: StartErrorHandler) => {
      callErrorRef.current = onCallError;
      mutate(
        { resourceId, requestBody },
        {
          onError: (error) => {
            if (handleStartError(error, requestBody)) {
              optionsRef.current.onPluginNotice?.();
              return;
            }
            const blocked = getStartBlockedReason(error);
            if (blocked) {
              toast.error({ title: blocked.title, description: blocked.body });
              optionsRef.current.onPluginNotice?.();
              return;
            }
            onCallError?.(error as ApiError, requestBody);
          },
        },
      );
    },
    [handleStartError, mutate, resourceId, toast],
  );
  startRef.current = start;

  return { start, isPending, dialog: confirmation.dialog } as const;
}
