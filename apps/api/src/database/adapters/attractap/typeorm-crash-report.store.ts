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
