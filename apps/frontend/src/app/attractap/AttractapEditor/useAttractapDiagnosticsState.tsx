import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useCallback, useState } from 'react';
import { OpenAPI, useAttractapServiceGetReaderCrashReports } from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import de from './AttractapDiagnostics.de.json';
import en from './AttractapDiagnostics.en.json';
import { Props } from './AttractapDiagnostics.props';

export function useAttractapDiagnosticsState(props: Readonly<Props>) {
  const { t } = useTranslations({ de, en });
  const toast = useToastMessage();
  const [expandedReports, setExpandedReports] = useState<Record<number, boolean>>({});

  const toggleBacktrace = useCallback((reportId: number) => {
    setExpandedReports((prev) => ({ ...prev, [reportId]: !prev[reportId] }));
  }, []);

  const {
    data: reports,
    isLoading,
    isError,
  } = useAttractapServiceGetReaderCrashReports({ readerId: props.readerId as number }, undefined, {
    enabled: props.readerId !== undefined,
  });

  const downloadCoredump = useCallback(
    async (reportId: number) => {
      if (props.readerId === undefined) {
        return;
      }
      try {
        // eslint-disable-next-line no-restricted-syntax -- Coredumps are streamed as binary downloads.
        const response = await fetch(
          `${OpenAPI.BASE}/api/attractap/readers/${props.readerId}/crash-reports/${reportId}/coredump`,
          { credentials: 'include' },
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `reader-${props.readerId}-crash-${reportId}.coredump`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        toast.error({ title: t('downloadFailed'), description: (error as Error).message });
      }
    },
    [props.readerId, t, toast],
  );

  const chronological = [...(reports ?? [])].reverse();

  const heapValues = chronological
    .map((report) => report.heapFreeBytes)
    .filter((value): value is number => value !== null && value !== undefined);

  const maxHeap = heapValues.length > 0 ? Math.max(...heapValues) : 0;

  const fallback = t('notAvailable');
  return {
    t,
    expandedReports,
    toggleBacktrace,
    reports,
    isLoading,
    isError,
    downloadCoredump,
    chronological,
    heapValues,
    maxHeap,
    fallback,
  } as const;
}
