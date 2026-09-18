import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Chip, Spinner } from '@heroui/react';
import { useCallback, useState } from 'react';
import { OpenAPI, useAttractapServiceGetReaderCrashReports } from '@attraccess/react-query-client';
import { Button } from '../../../components/button';
import { useToastMessage } from '../../../components/toastProvider';
import de from './AttractapDiagnostics.de.json';
import en from './AttractapDiagnostics.en.json';

interface Props {
  readerId?: number;
}

function formatBytes(value: number | null | undefined, fallback: string): string {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (value < 1024) {
    return `${value} B`;
  }
  return `${(value / 1024).toFixed(1)} KB`;
}

function formatUptime(ms: number | null | undefined, fallback: string): string {
  if (ms === null || ms === undefined) {
    return fallback;
  }
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours ? `${hours}h` : null, minutes ? `${minutes}m` : null, `${seconds}s`].filter(Boolean).join(' ');
}

function symbolicationChipColor(status: string | null | undefined): 'success' | 'danger' | 'warning' | 'default' {
  switch (status) {
    case 'success':
      return 'success';
    case 'failed':
      return 'danger';
    case 'unavailable':
      return 'warning';
    default:
      return 'default';
  }
}

function mismatchChipColor(matches: boolean | null | undefined): 'danger' | 'default' {
  return matches === false ? 'danger' : 'default';
}

export function AttractapDiagnostics(props: Readonly<Props>) {
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
  const heapValues = chronological
    .map((report) => report.heapFreeBytes)
    .filter((value): value is number => value !== null && value !== undefined);
  const maxHeap = heapValues.length > 0 ? Math.max(...heapValues) : 0;
  const fallback = t('notAvailable');

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
                  title={`${formatBytes(report.heapFreeBytes, fallback)} — ${new Date(
                    report.createdAt,
                  ).toLocaleString()}`}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">{t('resetHistory')}</h4>
        <div className="flex flex-col gap-3">
          {reports.map((report) => (
            <div
              key={report.id}
              className="rounded-medium border border-default-200 p-3 flex flex-col gap-2"
              data-cy="attractap-diagnostics-report"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Chip color="warning" variant="soft" size="sm">
                    {report.resetReason}
                  </Chip>
                  {report.rebootReason && (
                    <Chip color="danger" variant="soft" size="sm" data-cy="attractap-diagnostics-reboot-reason">
                      {report.rebootReason}
                    </Chip>
                  )}
                  {report.symbolicationStatus && (
                    <Chip
                      color={symbolicationChipColor(report.symbolicationStatus)}
                      variant="soft"
                      size="sm"
                      data-cy="attractap-diagnostics-symbolication-status"
                    >
                      {t(`symbolication.${report.symbolicationStatus}`)}
                    </Chip>
                  )}
                  {report.firmwareMatchesLatestServer === false && (
                    <Chip color="danger" variant="soft" size="sm" data-cy="attractap-diagnostics-firmware-mismatch">
                      {t('firmwareMismatch')}
                    </Chip>
                  )}
                </div>
                <span className="text-xs text-default-400">{new Date(report.createdAt).toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                <span className="text-default-500">
                  {t('fields.heapFree')}: {formatBytes(report.heapFreeBytes, fallback)}
                </span>
                <span className="text-default-500">
                  {t('fields.largestBlock')}: {formatBytes(report.largestFreeBlockBytes, fallback)}
                </span>
                <span className="text-default-500">
                  {t('fields.uptime')}: {formatUptime(report.uptimeBeforeResetMs, fallback)}
                </span>
                <span className="text-default-500">
                  {t('fields.wsState')}: {report.wsState ?? fallback}
                </span>
                <span className="text-default-500">
                  {t('fields.wifiState')}: {report.wifiState ?? fallback}
                </span>
                <span className="text-default-500">
                  {t('fields.crashFirmware')}: {report.firmwareVersion ?? fallback}
                </span>
                <span className="text-default-500">
                  {t('fields.currentReaderFirmware')}:{' '}
                  <span className={report.firmwareMatchesCurrentReader === false ? 'text-danger' : undefined}>
                    {report.currentReaderFirmwareVersion ?? fallback}
                  </span>
                </span>
                <span className="text-default-500">
                  {t('fields.latestServerFirmware')}:{' '}
                  <span className={report.firmwareMatchesLatestServer === false ? 'text-danger' : undefined}>
                    {report.latestServerFirmwareVersion ?? fallback}
                  </span>
                </span>
              </div>
              {report.coredumpBuildId && (
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="font-mono text-xs text-default-500">
                    {t('buildId')}: {report.coredumpBuildId}
                  </span>
                  {report.coredumpBuildIdKnown !== null && report.coredumpBuildIdKnown !== undefined && (
                    <Chip
                      color={mismatchChipColor(report.coredumpBuildIdKnown)}
                      variant="soft"
                      size="sm"
                      data-cy="attractap-diagnostics-build-id-known"
                    >
                      {report.coredumpBuildIdKnown ? t('buildIdKnown') : t('buildIdMissing')}
                    </Chip>
                  )}
                </div>
              )}
              {report.symbolizedBacktrace && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium">{t('backtrace')}</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onPress={() => toggleBacktrace(report.id)}
                      data-cy="attractap-diagnostics-toggle-backtrace"
                    >
                      {expandedReports[report.id] ? t('hideBacktrace') : t('showBacktrace')}
                    </Button>
                  </div>
                  {expandedReports[report.id] && (
                    <pre
                      className="max-h-96 overflow-auto rounded-medium bg-default-100 p-3 text-xs font-mono whitespace-pre-wrap break-words"
                      data-cy="attractap-diagnostics-backtrace"
                    >
                      {report.symbolizedBacktrace}
                    </pre>
                  )}
                </div>
              )}

              {report.symbolicationStatus === 'unavailable' && (
                <p className="text-xs text-warning" data-cy="attractap-diagnostics-symbolication-hint">
                  {t('symbolicationUnavailableHint')}
                </p>
              )}

              <div>
                {report.coredumpSize ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => downloadCoredump(report.id)}
                    data-cy="attractap-diagnostics-download-coredump"
                  >
                    {t('downloadCoredump')} ({formatBytes(report.coredumpSize, fallback)})
                  </Button>
                ) : (
                  <span className="text-xs text-default-400">{t('noCoredump')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
