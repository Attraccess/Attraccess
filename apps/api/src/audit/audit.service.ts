import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { AuditLog } from '@attraccess/database-entities';
import { PluginAuditEvent, PluginAuditHostProvider, PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';
import { readAuditSettings } from './audit.config';
import { SettingsStoreService } from '../settings/settings-store.service';
import { projectAuditEvent } from './audit-policy';
import { AuditQueryDto } from './audit-query.dto';

@Injectable()
export class AuditService implements PluginAuditHostProvider, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);
  private stopping = false;
  private activeReads = 0;
  private storage?: DataSource;
  private pending = 0;
  private cleaning = false;

  constructor(
    private readonly source: DataSource,
    private readonly settings: SettingsStoreService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.storage?.isInitialized || this.stopping) return;
    // A separate connection guarantees that a receipt follows autocommit, never a
    // savepoint in the application's shared SQLite transaction. No schema sync.
    if (this.source.options.type !== 'sqlite' || this.source.options.database === ':memory:') return;
    const storage = new DataSource({
      type: 'sqlite',
      database: this.source.options.database,
      entities: [AuditLog],
      synchronize: false,
      migrationsRun: false,
      logging: false,
    });
    try {
      await storage.initialize();
      await storage.query('PRAGMA busy_timeout = 10');
      await storage.query('PRAGMA synchronous = FULL');
      this.storage = storage;
      await this.cleanup();
    } catch {
      if (storage.isInitialized) await storage.destroy().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    while (this.pending || this.cleaning || this.activeReads) await new Promise((resolve) => setTimeout(resolve, 5));
    const storage = this.storage;
    this.storage = undefined;
    if (storage?.isInitialized) await storage.destroy().catch(() => undefined);
  }

  async record(event: PluginAuditEvent & { pluginId: string }): Promise<PluginAuditReceipt> {
    try {
      const snapshot = projectAuditEvent(event);
      if (!snapshot || this.stopping || !this.storage?.isInitialized || this.pending >= 8)
        return { status: 'unavailable' };
      // Refuse an originating transaction even if it ends while settings are read.
      if (this.source.createQueryRunner().isTransactionActive) return { status: 'unavailable' };
      this.pending++;
      try {
        const config = await readAuditSettings(this.settings);
        if (
          !config.enabled ||
          !config.domains.includes('wago') ||
          this.stopping ||
          this.source.createQueryRunner().isTransactionActive
        )
          return { status: 'unavailable' };
        await this.storage.getRepository(AuditLog).insert({
          at: new Date(),
          domain: 'wago',
          pluginId: snapshot.pluginId,
          action: snapshot.action,
          operationId: snapshot.operationId,
          actorId: snapshot.principal.userId,
          authenticationMethod: snapshot.principal.authenticationMethod,
          apiTokenId: snapshot.principal.apiTokenId ?? null,
          outcome: snapshot.outcome,
          subjectType: snapshot.subject.type,
          subjectId: snapshot.subject.id,
          details: { ...snapshot.details } as Record<string, string | number>,
        });
        return { status: 'recorded' };
      } finally {
        this.pending--;
      }
    } catch {
      // Never log the event, SQLite parameters, or exception (may contain secrets).
      return { status: 'unavailable' };
    }
  }

  private cutoff(retentionDays: number): Date {
    return new Date(Date.now() - retentionDays * 86_400_000);
  }

  @Interval(60 * 60 * 1000)
  async cleanup(): Promise<void> {
    if (this.stopping || !this.storage?.isInitialized || this.cleaning) return;
    this.cleaning = true;
    try {
      const config = await readAuditSettings(this.settings);
      const cutoff = this.cutoff(config.retention_days);
      while (!this.stopping) {
        const result = await this.storage
          .getRepository(AuditLog)
          .createQueryBuilder()
          .delete()
          .where('id IN (SELECT id FROM audit_log WHERE at < :cutoff ORDER BY at LIMIT 1000)', { cutoff })
          .execute();
        const count = result.affected ?? 0;
        if (count > 0) this.logger.log(`Deleted ${count} expired audit rows`);
        if (count < 1000) break;
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    } catch {
      // Retention must not affect domain operations or expose database errors.
    } finally {
      this.cleaning = false;
    }
  }

  async list(query: AuditQueryDto) {
    if (this.stopping || !this.storage?.isInitialized)
      throw new ServiceUnavailableException('Audit storage unavailable');
    this.activeReads++;
    try {
      const config = await readAuditSettings(this.settings);
      const limit = Math.min(100, Math.max(1, query.limit ?? 50));
      const builder = this.storage
        .getRepository(AuditLog)
        .createQueryBuilder('audit')
        .where('audit.at >= :cutoff', { cutoff: this.cutoff(config.retention_days) });
      for (const key of [
        'domain',
        'action',
        'outcome',
        'operationId',
        'actorId',
        'subjectId',
        'subjectType',
      ] as const) {
        if (query[key] !== undefined) builder.andWhere(`audit.${key} = :${key}`, { [key]: query[key] });
      }
      if (query.eventPrefix !== undefined)
        builder.andWhere('substr(audit.action, 1, :prefixLength) = :prefix', {
          prefixLength: query.eventPrefix.length,
          prefix: query.eventPrefix,
        });
      if (query.from !== undefined) builder.andWhere('audit.at >= :from', { from: new Date(query.from) });
      if (query.to !== undefined) builder.andWhere('audit.at <= :to', { to: new Date(query.to) });
      if (query.beforeId !== undefined) builder.andWhere('audit.id < :beforeId', { beforeId: query.beforeId });
      const rows = await builder
        .orderBy('audit.id', 'DESC')
        .take(limit + 1)
        .getMany();
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
    } finally {
      this.activeReads--;
    }
  }
}
