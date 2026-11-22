import { useCallback } from 'react';
import { useMatterTranslations } from './i18n';
import { codeOf, MatterApiError } from './matterApi';

/** Where a code is looked up before the shared `error.<code>`: a translation key for the code. */
export type ErrorKeyOf = (code: string) => string;

/**
 * The administrator-facing text of a failed request: the translation of its backend `code` (first under the keys
 * `keysOf` give, in order, then `error.<code>`), else the message the error carries (a code this release does not know
 * yet, or a validation message), else the HTTP status. Used by every Matter view that reports a failed request.
 */
export function useMatterErrorText() {
  const { t, tExists } = useMatterTranslations();
  return useCallback(
    (error: unknown, ...keysOf: (ErrorKeyOf | undefined)[]): string => {
      const code = codeOf(error);
      const key = code
        ? [...keysOf.map((keyOf) => keyOf?.(code)), `error.${code}`].find((item) => item && tExists(item))
        : undefined;
      if (key) return t(key);
      if (error instanceof MatterApiError) return error.message || t('error.http', { status: error.status });
      return error instanceof Error ? error.message : String(error);
    },
    [t, tExists],
  );
}
