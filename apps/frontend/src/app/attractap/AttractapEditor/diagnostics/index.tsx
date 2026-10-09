import { Spinner } from '@heroui/react';
import { Props } from './useDiagnostics';
import { formatBytes } from './Reports';
import { useAttractapDiagnosticsState } from './useDiagnostics';
import { renderAttractapDiagnosticsReports } from './Reports';

export function AttractapDiagnostics(props: Readonly<Props>) {
  const {
    t,
    formatDateTime,
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
  } = useAttractapDiagnosticsState(props);

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
  return (
    <div className="flex flex-col gap-6" data-cy="attractap-diagnostics">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">{t('heading')}</h3>
        <p className="text-sm text-default-500">{t('description')}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">{t('heapTrend')}</h4>
        {heapValues.length === 0 ? (
          <p className="text-sm text-default-400">{t('heapTrendEmpty')}</p>
        ) : (
          <div className="flex items-end gap-1 h-24" data-cy="attractap-diagnostics-heap-trend">
            {chronological.map((report) => {
              const value = report.heapFreeBytes ?? 0;
              const heightPct = maxHeap > 0 ? Math.max(4, Math.round((value / maxHeap) * 100)) : 4;
              return (
                <div
                  key={report.id}
                  className="flex-1 rounded-t-sm min-w-[6px]"
                  style={{ height: `${heightPct}%`, backgroundColor: 'var(--accent)' }}
                  title={`${formatBytes(report.heapFreeBytes, fallback)} — ${formatDateTime(report.createdAt)}`}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">{t('resetHistory')}</h4>
        <div className="flex flex-col gap-3">
          {reports.map((report) =>
            renderAttractapDiagnosticsReports(report, {
              t,
              formatDateTime,
              fallback,
              toggleBacktrace,
              expandedReports,
              downloadCoredump,
            }),
          )}
        </div>
      </div>
    </div>
  );
}
