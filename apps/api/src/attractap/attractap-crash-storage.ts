import { AttractapCrashReport } from '@attraccess/database-entities';
import { AttractapReaderStorageImplementation } from './attractap-reader-storage';
import { AttractapCrashReportDto } from './dtos/crash-report.dto';
import { ReaderCrashReportPayload } from './websockets/websocket.types';
export abstract class AttractapCrashStorageImplementation extends AttractapReaderStorageImplementation {
  public async createCrashReport(readerId: number, payload: ReaderCrashReportPayload): Promise<AttractapCrashReport> {
    const coredump =
      typeof payload.coredumpBase64 === 'string' && payload.coredumpBase64.length > 0
        ? Buffer.from(payload.coredumpBase64, 'base64')
        : null;

    const report = await this.crashReportRepository.save({
      attractapId: readerId,
      resetReason: payload.resetReason,
      rebootReason: payload.rebootReason || null,
      heapFreeBytes: this.toNullableInt(payload.heapFreeBytes),
      largestFreeBlockBytes: this.toNullableInt(payload.largestFreeBlockBytes),
      uptimeBeforeResetMs: this.toNullableInt(payload.uptimeBeforeResetMs),
      wsState: payload.wsState ?? null,
      wifiState: payload.wifiState ?? null,
      firmwareVersion: payload.firmwareVersion ?? null,
      coredumpSize: coredump ? coredump.length : null,
      coredump,
      symbolicationStatus: coredump ? 'pending' : null,
    });

    if (coredump) {
      await this.symbolicateCrashReport(report, readerId, coredump);
    }

    report.coredump = null;
    return report;
  }

  protected async symbolicateCrashReport(
    report: AttractapCrashReport,
    readerId: number,
    coredump: Buffer,
  ): Promise<void> {
    try {
      const reader = await this.readerRepository.findOne({ where: { id: readerId } });
      // No explicit buildId: the symbolication service extracts the truncated app ELF
      // SHA256 from the coredump itself and matches it against published firmware ELFs.
      const result = await this.coredumpSymbolicationService.symbolicate(coredump, {
        variant: reader?.firmware?.variant ?? null,
      });
      await this.crashReportRepository.update(report.id, {
        coredumpBuildId: result.buildId,
        symbolicationStatus: result.status,
        symbolizedBacktrace: result.backtrace,
      });
      report.coredumpBuildId = result.buildId;
      report.symbolicationStatus = result.status;
      report.symbolizedBacktrace = result.backtrace;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to symbolicate coredump for report ${report.id}: ${message}`);
      await this.crashReportRepository
        .update(report.id, { symbolicationStatus: 'failed', symbolizedBacktrace: message })
        .catch(() => undefined);
      report.symbolicationStatus = 'failed';
      report.symbolizedBacktrace = message;
    }
  }

  public async getCrashReportsForReader(readerId: number): Promise<AttractapCrashReportDto[]> {
    const [reader, reports] = await Promise.all([
      this.readerRepository.findOne({ where: { id: readerId } }),
      this.crashReportRepository.find({
        where: { attractapId: readerId },
        order: { createdAt: 'DESC' },
      }),
    ]);

    const currentReaderFirmwareVersion = reader?.firmware?.version ?? null;
    const latestServerFirmwareVersion =
      reader?.firmware?.name && reader?.firmware?.variant
        ? (this.firmwareService.getFirmwareDefinition(reader.firmware.name, reader.firmware.variant)?.version ?? null)
        : null;

    return reports.map((report) =>
      this.toCrashReportDto(report, currentReaderFirmwareVersion, latestServerFirmwareVersion),
    );
  }

  protected toCrashReportDto(
    report: AttractapCrashReport,
    currentReaderFirmwareVersion: string | null,
    latestServerFirmwareVersion: string | null,
  ): AttractapCrashReportDto {
    const firmwareMatchesCurrentReader = this.compareNullableVersions(
      report.firmwareVersion,
      currentReaderFirmwareVersion,
    );
    const firmwareMatchesLatestServer = this.compareNullableVersions(
      report.firmwareVersion,
      latestServerFirmwareVersion,
    );

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
      firmwareMatchesCurrentReader,
      firmwareMatchesLatestServer,
      coredumpSize: report.coredumpSize,
      coredumpBuildId: report.coredumpBuildId,
      coredumpBuildIdKnown: report.coredumpBuildId
        ? this.firmwareService.hasSymbolForBuildId(report.coredumpBuildId)
        : null,
      symbolicationStatus: report.symbolicationStatus,
      symbolizedBacktrace: report.symbolizedBacktrace,
      createdAt: report.createdAt,
    };
  }

  protected compareNullableVersions(left: string | null, right: string | null): boolean | null {
    if (!left || !right) {
      return null;
    }
    return left === right;
  }

  public async getCrashReportCoredump(
    readerId: number,
    reportId: number,
  ): Promise<{ filename: string; coredump: Buffer } | null> {
    const report = await this.crashReportRepository.findOne({
      where: { id: reportId, attractapId: readerId },
      select: { id: true, attractapId: true, coredump: true },
    });

    if (!report?.coredump) {
      return null;
    }

    return {
      filename: `reader-${readerId}-crash-${reportId}.coredump`,
      coredump: report.coredump,
    };
  }

  protected toNullableInt(value: number | null | undefined): number | null {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return null;
    }
    return Math.trunc(value);
  }
}
