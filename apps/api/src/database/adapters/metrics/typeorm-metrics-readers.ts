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

/**
 * The window (from, to] in whole seconds. The 999 ms offset makes a stored value at the boundary second compare as
 * "not newer", with or without milliseconds.
 */
export function resetReportBounds(window: ResetReportWindow): { from: Date; to: Date } {
  return { from: new Date(window.fromSeconds * 1000 + 999), to: new Date(window.toSeconds * 1000 + 999) };
}

export const resetReportCountSql = () => `SELECT r."attractapId" AS "attractapId", a."name" AS "readerName",
    r."resetReason" AS "resetReason", COUNT(*) AS "count"
  FROM "attractap_crash_report" r
  LEFT JOIN "attractap" a ON a."id" = r."attractapId"
  WHERE r."createdAt" > $1 AND r."createdAt" <= $2 AND r."resetReason" = ANY($3::text[])
  GROUP BY r."attractapId", a."name", r."resetReason"`;

@Injectable()
export class TypeOrmResetReportCountReader implements ResetReportCountReader {
  constructor(@InjectRepository(AttractapCrashReport) private readonly reports: Repository<AttractapCrashReport>) {}

  async countByReaderAndReason(window: ResetReportWindow, reasons: readonly string[]): Promise<ResetReportCount[]> {
    const { from, to } = resetReportBounds(window);
    const rows = (await this.reports.query(resetReportCountSql(), [from, to, [...reasons]])) as Array<
      ResetReportCount & { count: number | string }
    >;
    return rows.map((row) => ({ ...row, count: Number(row.count) }));
  }
}
