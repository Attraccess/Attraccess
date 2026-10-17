import { AuditLog, Project, Resource, ResourceGroup, User } from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { AuditLabelReader, AuditLabelRow, AuditPersistence, AuditReadFilter, LegacyAuditMetadataRow } from './port';
import { toApplicationRecord } from '../../database/sqlite/backend';

/** SQLite-owned metadata and bounded name projections; never selects credentials or relations. */
export class SqliteAuditLabelReader extends AuditLabelReader {
  constructor(private readonly source: DataSource) {
    super();
  }
  userNames(ids: readonly number[]): Promise<AuditLabelRow[]> {
    return this.names(User, ids, 'username');
  }
  resourceNames(ids: readonly number[]): Promise<AuditLabelRow[]> {
    return this.names(Resource, ids, 'name');
  }
  groupNames(ids: readonly number[]): Promise<AuditLabelRow[]> {
    return this.names(ResourceGroup, ids, 'name');
  }
  projectNames(ids: readonly number[]): Promise<AuditLabelRow[]> {
    return this.names(Project, ids, 'name');
  }
  private async names(
    entity: typeof User | typeof Resource | typeof ResourceGroup | typeof Project,
    ids: readonly number[],
    field: 'username' | 'name',
  ): Promise<AuditLabelRow[]> {
    if (!ids.length || !this.source.hasMetadata(entity)) return [];
    return this.source
      .createQueryBuilder()
      .select('subject.id', 'id')
      .addSelect(`subject.${field}`, 'label')
      .from(entity, 'subject')
      .where('subject.id IN (:...ids)', { ids: [...ids] })
      .getRawMany<AuditLabelRow>();
  }
}

/** Independent durable connection to the same file. Never acknowledges a savepoint as a durable write. */
export class SqliteAuditPersistence extends AuditPersistence {
  private storage?: DataSource;
  private readonly labels: SqliteAuditLabelReader;
  constructor(private readonly source: DataSource) {
    super();
    this.labels = new SqliteAuditLabelReader(source);
  }
  userNames(ids: readonly number[]) {
    return this.labels.userNames(ids);
  }
  resourceNames(ids: readonly number[]) {
    return this.labels.resourceNames(ids);
  }
  groupNames(ids: readonly number[]) {
    return this.labels.groupNames(ids);
  }
  projectNames(ids: readonly number[]) {
    return this.labels.projectNames(ids);
  }
  available(): boolean {
    return this.storage?.isInitialized === true;
  }
  originatingTransactionActive(): boolean {
    return this.source.createQueryRunner().isTransactionActive;
  }
  async open(): Promise<void> {
    if (this.available() || this.source.options.type !== 'sqlite' || this.source.options.database === ':memory:')
      return;
    const storage = new DataSource({
      type: 'sqlite',
      database: this.source.options.database,
      entities: [AuditLog],
      synchronize: false,
      migrationsRun: false,
      logging: false,
      busyTimeout: 10,
    });
    try {
      await storage.initialize();
      await storage.query('PRAGMA busy_timeout = 10');
      await storage.query('PRAGMA synchronous = FULL');
      this.storage = storage;
    } catch {
      if (storage.isInitialized) await storage.destroy().catch(() => undefined);
    }
  }
  async close(): Promise<void> {
    const storage = this.storage;
    this.storage = undefined;
    if (storage?.isInitialized) await storage.destroy().catch(() => undefined);
  }
  async read(filter: AuditReadFilter): Promise<AuditLog[]> {
    const builder = this.connection()
      .getRepository(AuditLog)
      .createQueryBuilder('audit')
      .where('audit.at >= :cutoff', { cutoff: filter.cutoff });
    for (const key of ['domain', 'action', 'outcome', 'operationId', 'actorId', 'subjectId', 'subjectType'] as const) {
      if (filter[key] !== undefined) builder.andWhere(`audit.${key} = :${key}`, { [key]: filter[key] });
    }
    if (filter.eventPrefix !== undefined)
      builder.andWhere('substr(audit.action, 1, :prefixLength) = :prefix', {
        prefixLength: filter.eventPrefix.length,
        prefix: filter.eventPrefix,
      });
    if (filter.from !== undefined) builder.andWhere('audit.at >= :from', { from: filter.from });
    if (filter.to !== undefined) builder.andWhere('audit.at <= :to', { to: filter.to });
    if (filter.beforeId !== undefined) builder.andWhere('audit.id < :beforeId', { beforeId: filter.beforeId });
    return toApplicationRecord(await builder.orderBy('audit.id', 'DESC').take(filter.limit).getMany());
  }
  async insert(event: Omit<AuditLog, 'id'>): Promise<void> {
    await this.connection().getRepository(AuditLog).insert(event);
  }
  async hasLegacyMetadata(): Promise<boolean> {
    const rows = await this.connection().query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'password_policy_audit_overflow' LIMIT 1",
    );
    return rows.some((row: { name?: unknown }) => row.name === 'password_policy_audit_overflow');
  }
  async legacyMetadata(ids: readonly number[]): Promise<LegacyAuditMetadataRow[]> {
    if (!ids.length) return [];
    const rows = await this.connection().query(
      `SELECT legacyAuditId, metadata FROM password_policy_audit_overflow WHERE legacyAuditId IN (${ids.map(() => '?').join(', ')})`,
      [...ids],
    );
    return rows.map((row: { legacyAuditId?: unknown; legacyauditid?: unknown; metadata: unknown }) => ({
      legacyAuditId: row.legacyAuditId ?? row.legacyauditid,
      metadata: row.metadata,
    }));
  }
  removeExpired(cutoff: Date, withLegacyMetadata: boolean): Promise<number> {
    return this.connection().transaction(async (manager) => {
      const rows = await manager.query<{ id: number }[]>(
        'SELECT id FROM audit_log WHERE at < ? ORDER BY at, id LIMIT 1000',
        [cutoff.toISOString().replace('T', ' ').replace('Z', '')],
      );
      if (!rows.length) return 0;
      const ids = rows.map(({ id }) => id);
      const placeholders = ids.map(() => '?').join(', ');
      if (withLegacyMetadata)
        await manager.query(
          `DELETE FROM password_policy_audit_overflow WHERE legacyAuditId IN (SELECT json_extract(details, '$.legacyAuditId') FROM audit_log WHERE id IN (${placeholders}))`,
          ids,
        );
      await manager.query(`DELETE FROM audit_log WHERE id IN (${placeholders})`, ids);
      return rows.length;
    });
  }
  private connection(): DataSource {
    const storage = this.storage;
    if (!storage?.isInitialized) throw new Error('Audit storage unavailable');
    return storage;
  }
}
