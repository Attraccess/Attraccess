import { useCallback } from 'react';
import { useMatterTranslations } from '../i18n';
import { FabricApiError } from './api';

/** The machine-readable code of a failed fabric & backup request, if the backend sent one. */
export const codeOf = (error: unknown): string | null => (error instanceof FabricApiError ? error.code : null);

/** Where a code is looked up first; `fabric.error.<code>` is always tried after it. */
export type ErrorKeyOf = (code: string) => string;

/** "Back up now" reports the reasons of the backup status table; the backend sends `busy` for `sidecar_busy`. */
export const backupReasonKey: ErrorKeyOf = (code) => `fabric.backups.reason.${code === 'busy' ? 'sidecar_busy' : code}`;

/**
 * The administrator-facing text of a failed request: the translation of its backend `code`, else the message the
 * error carries (a network error, or a code this release does not know yet), else the HTTP status.
 */
export function useErrorText() {
  const { t, tExists } = useMatterTranslations();
  return useCallback(
    (error: unknown, keyOf?: ErrorKeyOf): string => {
      const code = codeOf(error);
      const key = code ? [keyOf?.(code), `fabric.error.${code}`].find((item) => item && tExists(item)) : undefined;
      if (key) return t(key);
      if (error instanceof FabricApiError) return error.message || t('fabric.error.http', { status: error.status });
      return error instanceof Error ? error.message : String(error);
    },
    [t, tExists],
  );
}
