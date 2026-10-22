import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, DataSource, QueryRunner } from 'typeorm';
import {
  User,
  Resource,
  Project,
  ResourceGroup,
  MqttServer,
  ResourceUsage,
  Session,
} from '@attraccess/database-entities';
import { activeUsageWhere } from '../../database/sqlite/usage-integrity';
import {
  MetricsPersistence,
  MetricsSnapshot,
  MetricsQueryInstrumentation,
  QueryObserver,
  QueryObservation,
} from './port';

@Injectable()
export class TypeormMetricsPersistence extends MetricsPersistence {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(ResourceGroup)
    private readonly resourceGroupRepository: Repository<ResourceGroup>,
    @InjectRepository(MqttServer)
    private readonly mqttServerRepository: Repository<MqttServer>,
    @InjectRepository(ResourceUsage)
    private readonly resourceUsageRepository: Repository<ResourceUsage>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
  ) {
    super();
  }
  async snapshot(at: Date): Promise<MetricsSnapshot> {
    const [users, resources, projects, groups, mqttServers, activeUsageSessions, activeAuthSessions, localeCounts] =
      await Promise.all([
        this.userRepository.count(),
        this.resourceRepository.count(),
        this.projectRepository.count(),
        this.resourceGroupRepository.count(),
        this.mqttServerRepository.count(),
        this.resourceUsageRepository.count({ where: activeUsageWhere() }),
        this.sessionRepository.count({ where: { expiresAt: MoreThan(at) } }),
        this.userRepository
          .createQueryBuilder('user')
          .select('user.locale', 'locale')
          .addSelect('COUNT(*)', 'count')
          .groupBy('user.locale')
          .getRawMany<{ locale: string; count: string }>(),
      ]);
    return {
      users,
      resources,
      projects,
      groups,
      mqttServers,
      activeUsageSessions,
      activeAuthSessions,
      localeCounts: localeCounts.map((row) => ({ locale: row.locale, count: parseInt(row.count, 10) })),
    };
  }
}

type DbMethod = QueryObservation['method'];
interface ParsedSql {
  method: DbMethod;
  entity: string;
  observable: boolean;
}
const SKIP_VERBS = new Set(['begin', 'commit', 'rollback', 'savepoint', 'release', 'pragma']);
const PATCH_FLAG = '__attraccessDbMetricsPatched';
interface PatchableDriver {
  createQueryRunner: (mode: 'master' | 'slave') => QueryRunner;
  [PATCH_FLAG]?: boolean;
}
const patchedRunners = new WeakSet<QueryRunner>();

export class TypeormQueryInstrumentation extends MetricsQueryInstrumentation {
  constructor(private readonly source: DataSource) {
    super();
  }

  install(observer: QueryObserver): void {
    const driver = this.source.driver as unknown as PatchableDriver;
    if (driver[PATCH_FLAG]) return;
    const original = driver.createQueryRunner.bind(driver);
    driver.createQueryRunner = (mode: 'master' | 'slave') => {
      const runner = original(mode);
      if (patchedRunners.has(runner)) return runner;
      patchedRunners.add(runner);
      const query = runner.query.bind(runner) as (
        sql: string,
        parameters?: unknown[],
        structured?: boolean,
      ) => Promise<unknown>;
      runner.query = (async (sql: string, parameters?: unknown[], structured?: boolean) => {
        const parsed = parseSql(sql);
        if (!parsed.observable || !observer.enabled()) return query(sql, parameters, structured);
        const start = process.hrtime.bigint();
        try {
          const result = await query(sql, parameters, structured);
          observer.record({
            method: parsed.method,
            entity: parsed.entity,
            seconds: Number(process.hrtime.bigint() - start) / 1e9,
          });
          return result;
        } catch (error) {
          observer.record({
            method: parsed.method,
            entity: parsed.entity,
            seconds: Number(process.hrtime.bigint() - start) / 1e9,
            errorType: classifyError(error),
          });
          throw error;
        }
      }) as QueryRunner['query'];
      return runner;
    };
    driver[PATCH_FLAG] = true;
  }
}

export function parseSql(sql: string): ParsedSql {
  const trimmed = sql.trimStart();
  const verbMatch = /^([a-zA-Z]+)/.exec(trimmed);
  const verb = verbMatch ? verbMatch[1].toLowerCase() : '';
  if (SKIP_VERBS.has(verb)) {
    return { method: 'other', entity: 'unknown', observable: false };
  }
  let method: DbMethod = 'other';
  if (verb === 'select') method = 'select';
  else if (verb === 'insert' || verb === 'replace') method = 'insert';
  else if (verb === 'update') method = 'update';
  else if (verb === 'delete') method = 'delete';
  let entity = 'unknown';
  if (method === 'select' || method === 'delete') {
    entity = extractAfter(trimmed, /\bFROM\s+/i);
  } else if (method === 'insert') {
    entity = extractAfter(trimmed, /\bINTO\s+/i);
  } else if (method === 'update') {
    entity = extractAfter(trimmed, /^\s*UPDATE\s+/i);
  }
  return { method, entity, observable: true };
}

function extractAfter(sql: string, anchor: RegExp): string {
  const match = anchor.exec(sql);
  if (!match) return 'unknown';
  const remaining = sql.slice(match.index + match[0].length);
  const tokenMatch = /^["`[]?([a-zA-Z0-9_]+)["`\]]?/.exec(remaining);
  return tokenMatch ? tokenMatch[1] : 'unknown';
}

function classifyError(err: unknown): string {
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && code) return code;
    const name = (err as { name?: unknown }).name;
    if (typeof name === 'string' && name) return name;
  }
  return 'unknown';
}
