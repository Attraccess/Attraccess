import { Chip } from '@heroui/react';
import { Button } from '../../../../components/button/index';
import { useAttractapDiagnosticsState } from './useDiagnostics';
export function formatBytes(value: number | null | undefined, fallback: string): string {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (value < 1024) {
    return `${value} B`;
  }
  return `${(value / 1024).toFixed(1)} KB`;
}

export function formatUptime(ms: number | null | undefined, fallback: string): string {
  if (ms === null || ms === undefined) {
    return fallback;
  }
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours ? `${hours}h` : null, minutes ? `${minutes}m` : null, `${seconds}s`].filter(Boolean).join(' ');
}

export function mismatchChipColor(matches: boolean | null | undefined): 'danger' | 'default' {
  return matches === false ? 'danger' : 'default';
}

export function symbolicationChipColor(
  status: string | null | undefined,
): 'success' | 'danger' | 'warning' | 'default' {
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

type Model = ReturnType<typeof useAttractapDiagnosticsState>;

type Props = Pick<
  Model,
  't' | 'formatDateTime' | 'fallback' | 'toggleBacktrace' | 'expandedReports' | 'downloadCoredump'
>;

export function renderAttractapDiagnosticsReports(
  report: NonNullable<Model['reports']>[number],
  { t, formatDateTime, fallback, toggleBacktrace, expandedReports, downloadCoredump }: Props,
) {
  return (
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
        <span className="text-xs text-default-400">{formatDateTime(report.createdAt)}</span>
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
  );
}
