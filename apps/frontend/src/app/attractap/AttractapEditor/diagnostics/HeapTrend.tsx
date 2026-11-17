import { useDateTimeFormatter, useTranslations } from '@attraccess/plugins-frontend-ui';
import type { AttractapCrashReportDto } from '@attraccess/react-query-client';
import de from '../AttractapDiagnostics.de.json';
import en from '../AttractapDiagnostics.en.json';
import { formatBytes } from './formatters';

interface HeapTrendProps {
  /** Reports in chronological order (oldest first). */
  reports: AttractapCrashReportDto[];
}

/** Bar chart of the free heap before each reset. */
export function HeapTrend({ reports }: Readonly<HeapTrendProps>) {
  const { t } = useTranslations({ de, en });
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  const fallback = t('notAvailable');
  const heapValues = reports
    .map((report) => report.heapFreeBytes)
    .filter((value): value is number => value !== null && value !== undefined);
  const maxHeap = heapValues.length > 0 ? Math.max(...heapValues) : 0;

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium">{t('heapTrend')}</h4>
      {heapValues.length === 0 ? (
        <p className="text-sm text-default-400">{t('heapTrendEmpty')}</p>
      ) : (
        <div className="flex items-end gap-1 h-24" data-cy="attractap-diagnostics-heap-trend">
          {reports.map((report) => {
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
  );
}
