import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  StartUsageSessionDto,
  useGetNetworkRestrictionStatusKey,
  useResourceUsageStartBlockedKey,
  useResourceUsageStartSession,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../components/toastProvider';
import { isNetworkRestrictedError } from '../../../../utils/apiError';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';
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
 * confirmation and retries with its step id; a 403 START_BLOCKED shows the plugin's reason as written. A 403
 * NETWORK_RESTRICTED (the user's network changed since the controls were drawn) shows its translated message.
 * Every web start (start, takeover, QR link) goes through here; render `dialog` next to the start control.
 *
 * `onSuccess` and `onError` are hook-level mutation callbacks, so they still run when the caller unmounts
 * before the reply (the session-started event can swap the start control out first). Only the plugin
 * confirmation, the block notice and the per-call error handler need the caller mounted.
 */
export function useStartSessionWithConfirmation(resourceId: number, options: Options) {
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { t, tExists } = useTranslations({
    en: { api: API_ERROR_TRANSLATIONS_EN },
    de: { api: API_ERROR_TRANSLATIONS_DE },
  });
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const { mutate, isPending } = useResourceUsageStartSession(undefined, {
    onSuccess: (_data, { body }) => optionsRef.current.onSuccess(body),
    onError: (error, { body }) => {
      if (isNetworkRestrictedError(error)) {
        toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
        // The controls were drawn for another network: ask again so they match.
        void queryClient.invalidateQueries({ queryKey: [useGetNetworkRestrictionStatusKey] });
        return;
      }
      if (!isPluginStartError(error)) optionsRef.current.onError(error as ApiError, body);
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
        { path: { resourceId }, body: requestBody },
        {
          onError: (error) => {
            if (isNetworkRestrictedError(error)) return;
            if (handleStartError(error, requestBody)) {
              optionsRef.current.onPluginNotice?.();
              return;
            }
            const blocked = getStartBlockedReason(error);
            if (blocked) {
              toast.error({ title: blocked.title, description: blocked.body });
              // The page did not know about the block yet: show the notice now instead of with the next poll.
              void queryClient.invalidateQueries({ queryKey: [useResourceUsageStartBlockedKey] });
              optionsRef.current.onPluginNotice?.();
              return;
            }
            onCallError?.(error as ApiError, requestBody);
          },
        },
      );
    },
    [handleStartError, mutate, queryClient, resourceId, toast],
  );
  startRef.current = start;

  return { start, isPending, dialog: confirmation.dialog } as const;
}
