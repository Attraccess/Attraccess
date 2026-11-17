import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import {
  AttractapCrashReport,
  MqttServer,
  Project,
  Resource,
  ResourceGroup,
  ResourceUsage,
  Session,
  User,
} from '@attraccess/database-entities';
import { activeUsageWhere } from '../usage/active-usage-queries';
import {
  GaugeCountReader,
  InitialGaugeCounts,
  ResetReportCount,
  ResetReportCountReader,
  ResetReportWindow,
} from '../../../metrics/metrics-readers.port';

@Injectable()
export class TypeOrmGaugeCountReader implements GaugeCountReader {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(ResourceGroup) private readonly resourceGroups: Repository<ResourceGroup>,
    @InjectRepository(MqttServer) private readonly mqttServers: Repository<MqttServer>,
    @InjectRepository(ResourceUsage) private readonly resourceUsages: Repository<ResourceUsage>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
  ) {}

  async readInitialGaugeCounts(): Promise<InitialGaugeCounts> {
    const [users, resources, projects, resourceGroups, mqttServers, activeUsageSessions, activeAuthSessions, locales] =
      await Promise.all([
        this.users.count(),
        this.resources.count(),
        this.projects.count(),
        this.resourceGroups.count(),
        this.mqttServers.count(),
        this.resourceUsages.count({ where: activeUsageWhere() }),
        this.sessions.count({ where: { expiresAt: MoreThan(new Date()) } }),
        this.users
          .createQueryBuilder('user')
          .select('user.locale', 'locale')
          .addSelect('COUNT(*)', 'count')
          .groupBy('user.locale')
          .getRawMany<{ locale: string | null; count: string }>(),
      ]);
    return {
      users,
      resources,
      projects,
      resourceGroups,
      mqttServers,
      activeUsageSessions,
      activeAuthSessions,
      usersPerLocale: locales.map((row) => ({ locale: row.locale, count: parseInt(row.count, 10) })),
    };
  }
}

/** SQLite stores createdAt as UTC "YYYY-MM-DD HH:MM:SS" (optionally with ".mmm"). */
function sqliteTimestamp(epochSeconds: number, fraction: string): string {
  return `${new Date(epochSeconds * 1000).toISOString().slice(0, 19).replace('T', ' ')}${fraction}`;
}

/**
 * The window (from, to] in whole seconds. The ".999" suffix makes a stored value at the boundary second compare as
 * "not newer", with or without milliseconds.
 */
export function sqliteResetReportBounds(window: ResetReportWindow): { from: string; to: string } {
  return { from: sqliteTimestamp(window.fromSeconds, '.999'), to: sqliteTimestamp(window.toSeconds, '.999') };
}

export const resetReportCountSql = (
  reasonCount: number,
) => `SELECT r."attractapId" AS attractapId, a."name" AS readerName, r."resetReason" AS resetReason, COUNT(*) AS count
  FROM "attractap_crash_report" r
  LEFT JOIN "attractap" a ON a."id" = r."attractapId"
  WHERE r."createdAt" > ? AND r."createdAt" <= ? AND r."resetReason" IN (${Array.from({ length: reasonCount }, () => '?').join(', ')})
  GROUP BY r."attractapId", a."name", r."resetReason"`;

@Injectable()
export class TypeOrmResetReportCountReader implements ResetReportCountReader {
  constructor(@InjectRepository(AttractapCrashReport) private readonly reports: Repository<AttractapCrashReport>) {}

  async countByReaderAndReason(window: ResetReportWindow, reasons: readonly string[]): Promise<ResetReportCount[]> {
    const { from, to } = sqliteResetReportBounds(window);
    const rows = (await this.reports.query(resetReportCountSql(reasons.length), [from, to, ...reasons])) as Array<
      ResetReportCount & { count: number | string }
    >;
    return rows.map((row) => ({ ...row, count: Number(row.count) }));
  }
}
