import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AttractapCrashReport } from '@attraccess/database-entities';
import type {
  AttractapCrashReportRecord,
  AttractapCrashSymbolication,
  NewAttractapCrashReport,
} from '@attraccess/application-models';
import { Repository } from 'typeorm';
import type { AttractapCrashReportStore } from '../../../attractap/crash-report-store.port';
import { toCrashReport } from './attractap-mappers';

@Injectable()
export class TypeOrmAttractapCrashReportStore implements AttractapCrashReportStore {
  constructor(@InjectRepository(AttractapCrashReport) private readonly reports: Repository<AttractapCrashReport>) {}

  async create(report: NewAttractapCrashReport & { attractapId: number }): Promise<AttractapCrashReportRecord> {
    const saved = await this.reports.save({
      ...report,
      coredump: report.coredump ? Buffer.from(report.coredump) : null,
    });
    return toCrashReport(saved as AttractapCrashReport);
  }

  async findOfReader(reportId: number, readerId: number): Promise<AttractapCrashReportRecord | null> {
    const report = await this.reports.findOne({ where: { id: reportId, attractapId: readerId } });
    return report ? toCrashReport(report) : null;
  }

  async findAwaiting(
    readerId: number,
    expected: { size: number; crc32: number },
  ): Promise<AttractapCrashReportRecord | null> {
    const report = await this.reports.findOne({
      where: {
        attractapId: readerId,
        coredumpStatus: 'awaiting',
        coredumpExpectedSize: expected.size,
        coredumpExpectedCrc32: expected.crc32,
      },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return report ? toCrashReport(report) : null;
  }

  async storeAwaitedCoredump(report: { id: number; attractapId: number }, coredump: Uint8Array): Promise<boolean> {
    const result = await this.reports.update(
      { id: report.id, attractapId: report.attractapId, coredumpStatus: 'awaiting' },
      {
        coredump: Buffer.from(coredump),
        coredumpSize: coredump.length,
        coredumpStatus: 'stored',
        symbolicationStatus: 'pending',
      },
    );
    return !!result.affected;
  }

  async updateSymbolication(reportId: number, result: AttractapCrashSymbolication): Promise<void> {
    await this.reports.update(reportId, {
      ...(result.coredumpBuildId !== undefined ? { coredumpBuildId: result.coredumpBuildId } : {}),
      symbolicationStatus: result.symbolicationStatus,
      symbolizedBacktrace: result.symbolizedBacktrace,
    });
  }

  async listForReader(readerId: number): Promise<AttractapCrashReportRecord[]> {
    const reports = await this.reports.find({ where: { attractapId: readerId }, order: { createdAt: 'DESC' } });
    return reports.map(toCrashReport);
  }

  async findCoredump(readerId: number, reportId: number): Promise<Uint8Array | null> {
    const report = await this.reports.findOne({
      where: { id: reportId, attractapId: readerId },
      select: { id: true, attractapId: true, coredump: true },
    });
    return report?.coredump ?? null;
  }
}
