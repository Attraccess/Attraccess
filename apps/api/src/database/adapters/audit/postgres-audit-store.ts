import { AuditLog, Project, Resource, ResourceGroup, User } from '@attraccess/database-entities';
import type {
  AuditEntry,
  AuditEntryDraft,
  AuditEntryFilter,
  AuditSubjectNameKind,
} from '@attraccess/application-models';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  AuditAppendResult,
  AuditStore,
  AuditStoreOpenResult,
  AuditTransaction,
  AuditTransactionAbortedError,
  DurableAppendControl,
} from '../../../audit/audit-persistence.port';

import { createDataSource } from '../../postgres/postgres-connection';
import { engineTransactionOf } from '../common/legacy-engine-transaction';
import { postgresErrorCode } from '../../postgres/postgres-errors';
import { isDatabaseBusyError, isWriteConflict } from '../../persistence-errors';
import {
  ScopedUnitOfWork,
  TransactionScope,
  TransactionScopeError,
  UNIT_OF_WORK,
  UnitOfWork,
} from '../../unit-of-work';

/**
 * Extra attempts for an audit insert that waited out the busy timeout (lock timeout, serialization failure,
 * deadlock). The insert is a single statement that did not apply, so repeating it is safe.
 * Not used once shutdown has started, which keeps the drain inside Docker's stop grace period.
 */
export const AUDIT_BUSY_RETRIES = 2;

/** One name is enough: audit savepoints on one connection never overlap (see insertInTransaction). */
const AUDIT_SAVEPOINT = 'attraccess_audit_record';

const NAME_SOURCES = {
  user: { entity: User, field: 'username' },
  resource: { entity: Resource, field: 'name' },
  'resource-group': { entity: ResourceGroup, field: 'name' },
  project: { entity: Project, field: 'name' },
} as const;

const FILTER_COLUMNS = [
  'domain',
  'action',
  'outcome',
  'operationId',
  'actorId',
  'subjectId',
  'subjectType',
] as const satisfies readonly (keyof AuditEntryFilter)[];

class PostgresAuditTransaction implements AuditTransaction {
  constructor(
    readonly manager: EntityManager,
    readonly settingsHandle: TransactionScope,
  ) {}
}

/** Legacy password-policy rows keep oversized details in this table, when it exists. */
async function hasPasswordPolicyOverflow(storage: DataSource): Promise<boolean> {
  const rows = await storage.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'password_policy_audit_overflow' LIMIT 1`,
  );
  return rows.length > 0;
}

/** Hydrate only legacy rows returned on this page; current audit event details stay bounded at write time. */
async function hydrateLegacyPasswordPolicyDetails(storage: DataSource, items: AuditEntry[]): Promise<void> {
  const legacyIds = items
    .map((item) => {
      const legacyAuditId = Number(item.details.legacyAuditId);
      return Number.isSafeInteger(legacyAuditId) ? legacyAuditId : null;
    })
    .filter((id): id is number => id !== null);
  if (!legacyIds.length || !(await hasPasswordPolicyOverflow(storage))) return;
  const archived = await storage.query(
    'SELECT "legacyAuditId", "metadata" FROM password_policy_audit_overflow WHERE "legacyAuditId" = ANY($1::int[])',
    [legacyIds],
  );
  const metadata = new Map<string, Record<string, string | number | boolean | null>>();
  for (const row of archived) {
    try {
      const legacyAuditId = Number(row.legacyAuditId ?? row.legacyauditid);
      const value = JSON.parse(String(row.metadata));
      if (Number.isSafeInteger(legacyAuditId) && value && typeof value === 'object' && !Array.isArray(value))
        metadata.set(String(legacyAuditId), value);
    } catch {
      // A malformed archive must not make the audit list unavailable.
    }
  }
  for (const item of items) {
    const legacyId = item.details.legacyAuditId;
    if (Number.isSafeInteger(legacyId) && metadata.has(String(legacyId)))
      item.details = { ...item.details, ...metadata.get(String(legacyId)) };
  }
}

/**
 * The PostgreSQL audit store. Durable audit writes (no caller transaction) go through a small pool of their own, so a
 * write follows autocommit (acknowledged after the commit, `synchronous_commit` on) and never waits for a connection
 * that request transactions hold. Writes inside a caller's transaction are savepoints on that transaction. Writes on
 * the audit pool, including retention cleanup, run one at a time in request order, which keeps the acknowledgement
 * order of durable writes equal to their commit order.
 */
@Injectable()
export class PostgresAuditStore implements AuditStore {
  private storage?: DataSource;

  private writeTail: Promise<void> = Promise.resolve();

  /** Tail of the in-transaction audit writes per connection; see appendInTransaction. */
  private readonly savepointQueues = new WeakMap<DataSource, Promise<unknown>>();

  constructor(
    private readonly source: DataSource,
    @Optional() @Inject(UNIT_OF_WORK) private readonly unitOfWork?: UnitOfWork,
  ) {}

  get isOpen(): boolean {
    return this.storage?.isInitialized === true;
  }

  async open(): Promise<AuditStoreOpenResult> {
    if (this.isOpen) return { status: 'ready' };
    if (this.source.options.type !== 'postgres') return { status: 'unsupported' };
    // No schema sync: the schema belongs to the migrations of the main connection. A pool of its own keeps audit
    // writes independent of request transactions.
    const options = this.source.options;
    const storage = createDataSource({
      ...options,
      entities: [AuditLog],
      synchronize: false,
      migrationsRun: false,
      migrations: [],
      logging: false,
      // A durable write is acknowledged after the commit reached the disk, whatever the server default is.
      extra: {
        ...(options.extra ?? {}),
        max: 3,
        options: `${(options.extra as { options?: string } | undefined)?.options ?? ''} -c synchronous_commit=on`.trim(),
      },
    });
    try {
      await storage.initialize();
      this.storage = storage;
      return { status: 'ready' };
    } catch (error) {
      if (storage.isInitialized) await storage.destroy().catch(() => undefined);
      return {
        status: 'failed',
        code: postgresErrorCode(error),
        errorName: error instanceof Error ? error.name : undefined,
      };
    }
  }

  async close(): Promise<void> {
    const storage = this.storage;
    this.storage = undefined;
    if (storage?.isInitialized) await storage.destroy().catch(() => undefined);
  }

  activeTransaction(ref: TransactionScope | undefined): AuditTransaction | undefined {
    if (!ref) return undefined;
    const engine = engineTransactionOf(ref);
    // A scope that already committed or rolled back has no transaction left to join: the record is written
    // durably, as for a native handle whose transaction is no longer active.
    if (!engine && !ref.isOpen) return undefined;
    const manager = engine ?? this.managerOfScope(ref);
    return manager.queryRunner?.isTransactionActive ? new PostgresAuditTransaction(manager, ref) : undefined;
  }

  private managerOfScope(scope: TransactionScope): EntityManager {
    if (!(this.unitOfWork instanceof ScopedUnitOfWork))
      throw new TransactionScopeError('No unit of work is available to resolve the transaction scope');
    return this.unitOfWork.handleOf(scope) as EntityManager;
  }

  /**
   * Audit savepoints on one connection run one at a time. If two overlapped, ROLLBACK TO for a failed insert would
   * also undo the other write's row after that write was reported as recorded.
   */
  appendInTransaction(transaction: AuditTransaction, entry: AuditEntryDraft): Promise<AuditAppendResult> {
    const { manager } = transaction as PostgresAuditTransaction;
    const connection = manager.connection;
    const previous = this.savepointQueues.get(connection) ?? Promise.resolve();
    const insert = previous.then(() => this.insertInSavepoint(manager, entry));
    this.savepointQueues.set(
      connection,
      insert.catch(() => undefined),
    );
    return insert;
  }

  private async insertInSavepoint(manager: EntityManager, entry: AuditEntryDraft): Promise<AuditAppendResult> {
    // Explicit SQL savepoint instead of a nested TypeORM transaction: it leaves TypeORM's transaction depth and
    // transaction events alone, and it lets us tell a failed insert from a transaction the server aborted entirely.
    try {
      await manager.query(`SAVEPOINT ${AUDIT_SAVEPOINT}`);
    } catch (error) {
      return { status: 'failed', error, code: postgresErrorCode(error) };
    }
    try {
      await manager.insert(AuditLog, { at: new Date(), ...entry });
      await manager.query(`RELEASE SAVEPOINT ${AUDIT_SAVEPOINT}`);
      return { status: 'stored' };
    } catch (error) {
      try {
        await manager.query(`ROLLBACK TO SAVEPOINT ${AUDIT_SAVEPOINT}`);
        await manager.query(`RELEASE SAVEPOINT ${AUDIT_SAVEPOINT}`);
      } catch {
        // TypeORM still believes the transaction is open. An empty transaction lets its rollback succeed and
        // reset that state, so the connection stays usable. Fails harmlessly if a transaction is somehow still open.
        await manager.query('BEGIN').catch(() => undefined);
        throw new AuditTransactionAbortedError(postgresErrorCode(error));
      }
      return { status: 'failed', error, code: postgresErrorCode(error) };
    }
  }

  async appendDurably(entry: AuditEntryDraft, control: DurableAppendControl): Promise<AuditAppendResult> {
    return this.serializeStorageWrite<AuditAppendResult>(async () => {
      const storage = this.storage;
      // Writes admitted before shutdown still run; only a drain that ran out of time drops the rest.
      const refusal = control.refusal();
      if (refusal) return { status: 'refused', reason: refusal };
      if (!storage?.isInitialized) return { status: 'refused', reason: 'storage_unavailable' };
      for (let attempt = 0; ; attempt++) {
        try {
          await storage.getRepository(AuditLog).insert({ at: new Date(), ...entry });
          return { status: 'stored' };
        } catch (error) {
          const retry =
            (isDatabaseBusyError(error) || isWriteConflict(error)) &&
            attempt < AUDIT_BUSY_RETRIES &&
            !control.isStopping();
          if (!retry) return { status: 'failed', error, code: postgresErrorCode(error) };
        }
      }
    });
  }

  async deleteExpired(cutoff: Date, limit: number, isStopping: () => boolean): Promise<number> {
    const storage = this.storage;
    if (!storage?.isInitialized) return 0;
    const hasOverflow = await hasPasswordPolicyOverflow(storage);
    return this.serializeStorageWrite(async () => {
      if (isStopping()) return 0;
      return storage.transaction(async (manager) => {
        const rows: { id: number }[] = await manager.query(
          'SELECT "id" FROM "audit_log" WHERE "at" < $1 ORDER BY "at", "id" LIMIT $2',
          [cutoff, limit],
        );
        if (rows.length === 0) return 0;
        const ids = rows.map(({ id }) => id);
        if (hasOverflow) {
          await manager.query(
            `DELETE FROM password_policy_audit_overflow
                WHERE "legacyAuditId" IN (
                  SELECT ("details"->>'legacyAuditId')::int FROM "audit_log"
                   WHERE "id" = ANY($1::int[]) AND "details"->>'legacyAuditId' ~ '^[0-9]{1,9}$'
                )`,
            [ids],
          );
        }
        await manager.query('DELETE FROM "audit_log" WHERE "id" = ANY($1::int[])', [ids]);
        return rows.length;
      });
    });
  }

  async findEntries(filter: AuditEntryFilter, limit: number): Promise<{ entries: AuditEntry[]; hasMore: boolean }> {
    const storage = this.storage;
    if (!storage?.isInitialized) throw new Error('Audit storage unavailable');
    const builder = storage
      .getRepository(AuditLog)
      .createQueryBuilder('audit')
      .where('audit.at >= :cutoff', { cutoff: filter.notBefore });
    for (const key of FILTER_COLUMNS) {
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
    const rows = await builder
      .orderBy('audit.id', 'DESC')
      .take(limit + 1)
      .getMany();
    const entries: AuditEntry[] = rows.slice(0, limit);
    await hydrateLegacyPasswordPolicyDetails(storage, entries);
    return { entries, hasMore: rows.length > limit };
  }

  async findCurrentNames(kind: AuditSubjectNameKind, ids: number[]): Promise<Map<number, string>> {
    const { entity, field } = NAME_SOURCES[kind];
    if (!ids.length || !this.source.hasMetadata(entity)) return new Map();
    // At most one bounded query per entity kind, selecting no credentials, relations, or configuration.
    const rows = await this.source
      .createQueryBuilder()
      .select('subject.id', 'id')
      .addSelect(`subject.${field}`, 'label')
      .from(entity, 'subject')
      .where('subject.id IN (:...ids)', { ids })
      .getRawMany<{ id: number; label: string }>();
    return new Map(rows.map((row) => [row.id, row.label]));
  }

  /** Serializes every write on the audit storage connection, including cleanup transactions. */
  private async serializeStorageWrite<T>(write: () => Promise<T>): Promise<T> {
    const precedingWrite = this.writeTail;
    let releaseWrite!: () => void;
    this.writeTail = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    try {
      await precedingWrite;
      return await write();
    } finally {
      releaseWrite();
    }
  }
}
