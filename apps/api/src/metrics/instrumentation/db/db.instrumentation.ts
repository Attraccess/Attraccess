// QueryRunner-level patch capturing duration, slow queries, and errors for all SQL
// FEATURE: Metrics — database query timing instrumentation
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DB_METRICS } from '../../definitions/tokens';
import { DbMetrics } from '../../definitions/db.metrics';
import { MetricsToggleService } from '../../settings/metrics-toggle.service';

type DbMethod = 'select' | 'insert' | 'update' | 'delete' | 'other';

interface ParsedSql {
  method: DbMethod;
  entity: string;
  observable: boolean;
}

const SKIP_VERBS = new Set(['begin', 'commit', 'rollback', 'savepoint', 'release', 'pragma']);

const PATCH_FLAG = '__attraccessDbMetricsPatched';
const RUNNER_PATCH_FLAG = '__attraccessDbMetricsRunnerPatched';

interface PatchableDriver {
  createQueryRunner: (mode: 'master' | 'slave') => QueryRunner;
  [PATCH_FLAG]?: boolean;
}

type PatchableRunner = QueryRunner & { [RUNNER_PATCH_FLAG]?: boolean };

@Injectable()
export class DbMetricsInstrumentation implements OnModuleInit {
  constructor(
    @Inject(DB_METRICS) private readonly metrics: DbMetrics,
    private readonly toggle: MetricsToggleService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    this.install(this.dataSource);
  }

  install(dataSource: DataSource): void {
    const driver = dataSource.driver as unknown as PatchableDriver;
    if (driver[PATCH_FLAG]) return;
    const original = driver.createQueryRunner.bind(driver);
    const observe = this.observe.bind(this);
    driver.createQueryRunner = (mode: 'master' | 'slave') => {
      const runner = original(mode) as PatchableRunner;
      if (runner[RUNNER_PATCH_FLAG]) {
        return runner;
      }
      const originalQuery = runner.query.bind(runner) as (
        sql: string,
        parameters?: unknown[],
        useStructuredResult?: boolean,
      ) => Promise<unknown>;
      runner.query = ((sql: string, parameters?: unknown[], useStructuredResult?: boolean) => {
        const parsed = parseSql(sql);
        if (!parsed.observable) {
          return originalQuery(sql, parameters, useStructuredResult);
        }
        return observe(parsed, () => originalQuery(sql, parameters, useStructuredResult));
      }) as unknown as QueryRunner['query'];
      runner[RUNNER_PATCH_FLAG] = true;
      return runner;
    };
    driver[PATCH_FLAG] = true;
  }

  private async observe<T>(parsed: ParsedSql, exec: () => Promise<T>): Promise<T> {
    if (!this.toggle.isEnabledCached('db')) {
      return exec();
    }
    const start = process.hrtime.bigint();
    const labels = { entity: parsed.entity, method: parsed.method };
    try {
      const result = await exec();
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.queryDuration.observe(labels, seconds);
      if (seconds > this.toggle.getSlowQueryThresholdSecondsCached()) {
        this.metrics.slowQueriesTotal.inc(labels);
      }
      return result;
    } catch (err) {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.queryDuration.observe(labels, seconds);
      this.metrics.queryErrorsTotal.inc({ ...labels, error_type: classifyError(err) });
      throw err;
    }
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
