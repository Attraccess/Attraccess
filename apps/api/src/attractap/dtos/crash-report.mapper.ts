import type { AttractapCrashReportRecord } from '@attraccess/application-models';
import { AttractapCrashReportDto } from './crash-report.dto';

function compareNullableVersions(left: string | null, right: string | null): boolean | null {
  if (!left || !right) {
    return null;
  }
  return left === right;
}

/** The admin view of a crash report; the coredump itself is only downloadable on its own. */
export function toCrashReportDto(
  report: AttractapCrashReportRecord,
  currentReaderFirmwareVersion: string | null,
  latestServerFirmwareVersion: string | null,
  hasSymbolForBuildId: (buildId: string) => boolean,
): AttractapCrashReportDto {
  return {
    id: report.id,
    attractapId: report.attractapId,
    resetReason: report.resetReason,
    rebootReason: report.rebootReason,
    heapFreeBytes: report.heapFreeBytes,
    largestFreeBlockBytes: report.largestFreeBlockBytes,
    uptimeBeforeResetMs: report.uptimeBeforeResetMs,
    wsState: report.wsState,
    wifiState: report.wifiState,
    firmwareVersion: report.firmwareVersion,
    currentReaderFirmwareVersion,
    latestServerFirmwareVersion,
    firmwareMatchesCurrentReader: compareNullableVersions(report.firmwareVersion, currentReaderFirmwareVersion),
    firmwareMatchesLatestServer: compareNullableVersions(report.firmwareVersion, latestServerFirmwareVersion),
    coredumpSize: report.coredumpSize,
    coredumpStatus: report.coredumpStatus ?? null,
    coredumpExpectedSize: report.coredumpExpectedSize ?? null,
    coredumpBuildId: report.coredumpBuildId,
    coredumpBuildIdKnown: report.coredumpBuildId ? hasSymbolForBuildId(report.coredumpBuildId) : null,
    symbolicationStatus: report.symbolicationStatus,
    symbolizedBacktrace: report.symbolizedBacktrace,
    createdAt: report.createdAt,
  };
}
