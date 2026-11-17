import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { OpenAPI } from '@attraccess/react-query-client';
import { useCallback } from 'react';
import { useToastMessage } from '../../../../components/toastProvider';
import de from '../AttractapDiagnostics.de.json';
import en from '../AttractapDiagnostics.en.json';

/** Downloads a crash report's coredump as a file; shows a toast when the download fails. */
export function useCoredumpDownload(readerId: number | undefined) {
  const { t } = useTranslations({ de, en });
  const toast = useToastMessage();

  return useCallback(
    async (reportId: number) => {
      if (readerId === undefined) {
        return;
      }
      try {
        // eslint-disable-next-line no-restricted-syntax -- Coredumps are streamed as binary downloads.
        const response = await fetch(
          `${OpenAPI.BASE}/api/attractap/readers/${readerId}/crash-reports/${reportId}/coredump`,
          {
            credentials: 'include',
          },
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `reader-${readerId}-crash-${reportId}.coredump`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        toast.error({ title: t('downloadFailed'), description: (error as Error).message });
      }
    },
    [readerId, t, toast],
  );
}
