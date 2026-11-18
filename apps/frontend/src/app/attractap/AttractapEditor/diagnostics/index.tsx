import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useGetReaderCrashReports } from '@attraccess/react-query-client';
import { Spinner } from '@heroui/react';
import de from '../AttractapDiagnostics.de.json';
import en from '../AttractapDiagnostics.en.json';
import { CrashReportCard } from './CrashReportCard';
import { HeapTrend } from './HeapTrend';
import { hasPendingCoredump, PENDING_COREDUMP_POLL_INTERVAL_MS } from './pendingCoredump';
import { useCoredumpDownload } from './useCoredumpDownload';

export interface Props {
  readerId?: number;
}

export function AttractapDiagnostics(props: Readonly<Props>) {
  const { t } = useTranslations({ de, en });
  const {
    data: reports,
    isLoading,
    isError,
  } = useGetReaderCrashReports({ path: { readerId: props.readerId as number } }, undefined, {
    enabled: props.readerId !== undefined,
    refetchInterval: (query) => (hasPendingCoredump(query.state.data) ? PENDING_COREDUMP_POLL_INTERVAL_MS : false),
  });
  const downloadCoredump = useCoredumpDownload(props.readerId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-default-500" data-cy="attractap-diagnostics-loading">
        <Spinner size="sm" />
        <span>{t('loading')}</span>
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-danger" data-cy="attractap-diagnostics-error">
        {t('error')}
      </p>
    );
  }

  if (!reports || reports.length === 0) {
    return (
      <p className="text-sm text-default-500" data-cy="attractap-diagnostics-empty">
        {t('empty')}
      </p>
    );
  }
  const chronological = [...reports].reverse();

  return (
    <div className="flex flex-col gap-6" data-cy="attractap-diagnostics">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">{t('heading')}</h3>
        <p className="text-sm text-default-500">{t('description')}</p>
      </div>

      <HeapTrend reports={chronological} />

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">{t('resetHistory')}</h4>
        <div className="flex flex-col gap-3">
          {reports.map((report) => (
            <CrashReportCard key={report.id} report={report} onDownloadCoredump={downloadCoredump} />
          ))}
        </div>
      </div>
    </div>
  );
}
