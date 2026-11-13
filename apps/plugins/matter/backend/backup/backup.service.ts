import type { OperationResponse } from '@attraccess/matter-contract';
import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { MatterConnectionService } from '../connection/connection.service';
import { DeviceAuditService } from '../devices/audit.service';
import { MatterFabric } from '../devices/entities';
import { runTransaction } from '../fabric/db';
import { INSECURE_MESSAGE, conflict, sidecarCode } from '../fabric/errors';
import { factsOfRow, recordedFabricRow, type FabricFacts } from '../fabric/facts';
import { MatterFabricGuard } from '../fabric/guard';
import { RecoveryKeyService, RecoveryKeyUnreadableError } from '../fabric/recovery-key.service';
import { PLUGIN_MIGRATION_READER, type PluginMigrationReader } from '../fabric/tokens';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { BackupTrigger, MatterBackup } from './entities';
import { FILE_EXTENSION, FORMAT_VERSION, encryptBackup, type TableRows } from './format';
import { readTables } from './tables';

export const BACKUP_RETENTION = 10;
const FAILED_ATTEMPTS_KEPT = 20;
/** The sidecar's own cap on a request deadline: snapshots may take a while on a slow disk. */
export const BACKUP_TIMEOUT_MS = 60_000;

export type BackupFailureReason =
  | 'inconsistent'
  | 'sidecar_unavailable'
  | 'sidecar_busy'
  | 'insecure_transport'
  | 'no_recovery_key'
  | 'recovery_key_unreadable'
  | 'recovery_required'
  | 'no_fabric'
  | 'sidecar_error'
  | 'internal';

const FAILURE_TEXT: Record<BackupFailureReason, string> = {
  inconsistent:
    'The sidecar and the plugin disagree about the fabric (identity or generation), so no consistent backup can be made.',
  sidecar_unavailable: 'The Matter sidecar could not be reached.',
  sidecar_busy: 'The Matter sidecar is busy with another backup or restore. Try again shortly.',
  insecure_transport: INSECURE_MESSAGE,
  no_recovery_key: 'There is no recovery key yet. Generate one first.',
  recovery_key_unreadable: 'The stored recovery key cannot be read by this installation.',
  recovery_required: 'The fabric needs recovery first; no backup is made in this state.',
  no_fabric: 'There is no fabric to back up.',
  sidecar_error: 'The Matter sidecar could not produce a snapshot.',
  internal: 'The backup failed because of an internal error.',
};

export type BackupOptions = {
  /**
   * Start a new run after one that is already running instead of joining it: a backup that must use what was just
   * changed (a new recovery key, for example).
   */
  fresh?: boolean;
  /**
   * Back up while the plugin is in recovery: the sidecar's snapshot header gives the fabric facts and the tables are
   * taken as they are. A snapshot that does not match the plugin's record is not refused but stored marked as
   * inconsistent, so restoring it later brings the mismatch back instead of hiding it. Only for the pre-restore
   * backup, which keeps what a restore is about to replace.
   */
  allowInRecovery?: boolean;
};

class BackupFailure extends Error {
  constructor(readonly reason: BackupFailureReason) {
    super(FAILURE_TEXT[reason]);
  }
}

type Run = { id: string; createdAt: string; trigger: BackupTrigger; actor: number | null };
type Snapshot = OperationResponse<'backup.snapshot'>;
type SnapshotHeader = Snapshot['header'];
type Contents = { snapshot: Snapshot; tables: TableRows; consistent: boolean };

export type BackupView = {
  id: string;
  createdAt: string;
  trigger: BackupTrigger;
  actor: string | null;
  sizeBytes: number;
  sha256: string;
  outcome: 'succeeded';
  fabricId: string;
  fabricGeneration: number;
  recoveryKeyId: string;
  /** False when the plugin tables did not agree with the sidecar snapshot (a pre-restore backup taken in recovery). */
  consistent: boolean;
};

export type BackupsSummary = {
  lastSuccessfulAt: string | null;
  lastAttempt: { at: string; outcome: 'succeeded' | 'failed'; trigger: BackupTrigger; reason: string | null } | null;
  nextScheduledAt: string | null;
  retention: number;
  stored: BackupView[];
};

const VIEW_COLUMNS = [
  'id',
  'createdAt',
  'trigger',
  'actor',
  'outcome',
  'reason',
  'sizeBytes',
  'sha256',
  'formatVersion',
  'pluginVersion',
  'sidecarVersion',
  'matterJsVersion',
  'storageSchemaVersion',
  'pluginMigration',
  'fabricId',
  'rootCertFingerprint',
  'fabricGeneration',
  'storageInstanceId',
  'recoveryKeyId',
  'consistent',
] as const satisfies readonly (keyof MatterBackup)[];

export function backupView(row: MatterBackup): BackupView {
  return {
    id: row.id,
    createdAt: row.createdAt,
    trigger: row.trigger,
    // The user id travels as a string so the UI can treat "no actor" (the plugin itself) uniformly.
    actor: row.actor === null ? null : String(row.actor),
    sizeBytes: row.sizeBytes ?? 0,
    sha256: row.sha256 ?? '',
    outcome: 'succeeded',
    fabricId: row.fabricId ?? '',
    fabricGeneration: row.fabricGeneration ?? 0,
    recoveryKeyId: row.recoveryKeyId ?? '',
    consistent: row.consistent !== false,
  };
}

/**
 * Makes, stores and prunes encrypted backups. One backup runs at a time. It never logs, returns or audits the
 * recovery key, the decrypted content or the snapshot.
 */
@Injectable()
export class MatterBackupService {
  private inFlight: Promise<BackupView> | undefined;
  private nextScheduledAt: string | null = null;
  private readonly succeededListeners = new Set<(trigger: BackupTrigger) => void>();

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(MatterConnectionService) private readonly connectionService: Pick<MatterConnectionService, 'connection'>,
    @Inject(RecoveryKeyService) private readonly keys: RecoveryKeyService,
    @Inject(DeviceAuditService) private readonly audit: DeviceAuditService,
    @Inject(MatterFabricGuard) private readonly guard: MatterFabricGuard,
    @Inject(PLUGIN_MIGRATION_READER) private readonly migrationReader: PluginMigrationReader,
  ) {}

  private get repo() {
    return this.context.getRepository(MatterBackup);
  }

  setNextScheduledAt(at: string | null): void {
    this.nextScheduledAt = at;
  }

  /** Called after every stored backup, so the schedule can follow it without waiting for its next check. */
  onSucceeded(listener: (trigger: BackupTrigger) => void): () => void {
    this.succeededListeners.add(listener);
    return () => this.succeededListeners.delete(listener);
  }

  /**
   * Takes a backup now. Joins a backup that is already running, except for `pre_restore`, `restore` and `fresh` ones,
   * which must reflect the state at their own moment. `principal: null` is the plugin itself (schedule, events).
   */
  async backup(
    trigger: BackupTrigger,
    principal: PluginAuditPrincipal | null = null,
    options: BackupOptions = {},
  ): Promise<BackupView> {
    if (this.guard.busy) throw conflict('busy', 'A restore is in progress.');
    const own = options.fresh === true || trigger === 'pre_restore' || trigger === 'restore';
    while (this.inFlight) {
      if (!own) return this.inFlight;
      await this.inFlight.catch(() => undefined);
    }
    const run = this.attempt(trigger, principal, options).finally(() => {
      if (this.inFlight === run) this.inFlight = undefined;
    });
    this.inFlight = run;
    return run;
  }

  private async attempt(
    trigger: BackupTrigger,
    principal: PluginAuditPrincipal | null,
    options: BackupOptions,
  ): Promise<BackupView> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    try {
      const row = await this.produce({ id, createdAt, trigger, actor: principal?.userId ?? null }, options);
      await this.prune();
      await this.audit.record(
        'matter.backup_succeeded',
        principal,
        { type: 'matter.backup', ref: id },
        {
          backupRef: id,
          trigger,
          fabricGeneration: row.fabricGeneration ?? 0,
          system: principal === null,
        },
      );
      for (const listener of this.succeededListeners) listener(trigger);
      return backupView(row);
    } catch (error) {
      const reason = error instanceof BackupFailure ? error.reason : 'internal';
      if (!(error instanceof BackupFailure)) this.context.logger.warn?.('A Matter backup failed unexpectedly.');
      await this.recordFailure(id, createdAt, trigger, principal?.userId ?? null, reason);
      await this.audit.record(
        'matter.backup_failed',
        principal,
        { type: 'matter.backup', ref: id },
        { backupRef: id, trigger, reason, system: principal === null },
        'failed',
      );
      throw this.toHttp(reason);
    }
  }

  private async produce(run: Run, options: BackupOptions) {
    const connection = this.usableConnection(options);
    const key = await this.currentKey();
    const contents = await this.collect(connection, options);
    return this.store(run, contents, key);
  }

  /** The sidecar snapshot and the plugin tables, and whether they belong together. */
  private async collect(connection: MatterConnectionService['connection'], options: BackupOptions): Promise<Contents> {
    // The plugin's tables are read in one transaction together with the fabric record they must agree with; the
    // sidecar's snapshot is checked against that record afterwards.
    const { tables, recorded } = await runTransaction(this.context, async (manager) => ({
      recorded: factsOfRow(await recordedFabricRow(manager)),
      tables: await readTables(manager),
    }));
    if (!recorded && !options.allowInRecovery) throw new BackupFailure('no_fabric');

    let snapshot;
    try {
      snapshot = await connection.request('backup.snapshot', { body: {}, timeoutMs: BACKUP_TIMEOUT_MS });
    } catch (error) {
      throw new BackupFailure(failureOf(error));
    }
    const consistent = await this.matchesRecord(snapshot.header, recorded);
    if (!consistent && !options.allowInRecovery) throw new BackupFailure('inconsistent');
    return { snapshot, tables, consistent };
  }

  private async store(run: Run, { snapshot, tables, consistent }: Contents, key: { keyId: string; key: Buffer }) {
    const header = snapshot.header;
    const pluginMigration = await this.migrationReader();
    if (!pluginMigration) throw new BackupFailure('internal');
    const file = encryptBackup(
      { sidecar: { header, payload: snapshot.payload }, tables },
      {
        backupId: run.id,
        createdAt: run.createdAt,
        pluginVersion: this.context.manifest.version,
        pluginMigration,
        consistent,
      },
      key.key,
    );
    return this.repo.save({
      ...run,
      outcome: 'succeeded',
      reason: null,
      sizeBytes: file.length,
      sha256: createHash('sha256').update(file).digest('hex'),
      formatVersion: FORMAT_VERSION,
      pluginVersion: this.context.manifest.version,
      sidecarVersion: header.sidecarVersion,
      matterJsVersion: header.matterJsVersion,
      storageSchemaVersion: header.storageSchemaVersion,
      pluginMigration,
      fabricId: header.fabricId,
      rootCertFingerprint: header.rootCertFingerprint,
      fabricGeneration: header.fabricGeneration,
      storageInstanceId: header.storageInstanceId,
      recoveryKeyId: key.keyId,
      consistent,
      blob: file,
    });
  }

  private usableConnection(options: BackupOptions) {
    const connection = this.connectionService.connection;
    const status = connection.status();
    if (status.state !== 'connected') throw new BackupFailure('sidecar_unavailable');
    if (status.insecureTransport) throw new BackupFailure('insecure_transport');
    if (this.guard.recoveryRequired && !options.allowInRecovery) throw new BackupFailure('recovery_required');
    return connection;
  }

  private async currentKey(): Promise<{ keyId: string; key: Buffer }> {
    let key;
    try {
      key = await this.keys.currentKey();
    } catch (error) {
      throw new BackupFailure(error instanceof RecoveryKeyUnreadableError ? 'recovery_key_unreadable' : 'internal');
    }
    if (!key) throw new BackupFailure('no_recovery_key');
    return key;
  }

  /** Whether the snapshot is of the fabric the plugin recorded, and the record did not move meanwhile. */
  private async matchesRecord(header: SnapshotHeader, recorded: FabricFacts | null): Promise<boolean> {
    const after = factsOfRow(await recordedFabricRow(this.context.getRepository(MatterFabric).manager));
    const consistent =
      recorded !== null &&
      header.fabricId === recorded.fabricId &&
      header.fabricGeneration === recorded.fabricGeneration &&
      header.rootCertFingerprint === recorded.rootCertFingerprint &&
      header.storageInstanceId === recorded.storageInstanceId &&
      after !== null &&
      after.fabricId === recorded.fabricId &&
      after.fabricGeneration === recorded.fabricGeneration;
    return consistent;
  }

  private async recordFailure(
    id: string,
    createdAt: string,
    trigger: BackupTrigger,
    actor: number | null,
    reason: BackupFailureReason,
  ): Promise<void> {
    try {
      await this.repo.save({ id, createdAt, trigger, actor, outcome: 'failed', reason, blob: null });
      const stale = await this.repo
        .createQueryBuilder('b')
        .select('b.id', 'id')
        .where(`b.outcome = 'failed'`)
        .orderBy('b.createdAt', 'DESC')
        .offset(FAILED_ATTEMPTS_KEPT)
        .limit(1000)
        .getRawMany<{ id: string }>();
      if (stale.length) await this.repo.delete(stale.map((row) => row.id));
    } catch {
      this.context.logger.warn?.('A failed Matter backup attempt could not be recorded.');
    }
  }

  /** Keeps the newest `BACKUP_RETENTION` successful backups. */
  async prune(manager: EntityManager = this.repo.manager): Promise<number> {
    const surplus = await manager
      .getRepository(MatterBackup)
      .createQueryBuilder('b')
      .select('b.id', 'id')
      .where(`b.outcome = 'succeeded'`)
      .orderBy('b.createdAt', 'DESC')
      .addOrderBy('b.id', 'DESC')
      .offset(BACKUP_RETENTION)
      .limit(1000)
      .getRawMany<{ id: string }>();
    if (surplus.length) await manager.getRepository(MatterBackup).delete(surplus.map((row) => row.id));
    return surplus.length;
  }

  private toHttp(reason: BackupFailureReason) {
    const body = { code: reason, message: FAILURE_TEXT[reason] };
    if (reason === 'sidecar_unavailable') return new ServiceUnavailableException(body);
    if (reason === 'sidecar_error' || reason === 'internal') return new InternalServerErrorException(body);
    return conflict(reason === 'sidecar_busy' ? 'busy' : reason, FAILURE_TEXT[reason]);
  }

  // --- reading -----------------------------------------------------------------------------------------------------

  /** Without the file itself. */
  async list(): Promise<BackupView[]> {
    const rows = await this.repo
      .createQueryBuilder('b')
      .select(VIEW_COLUMNS.map((column) => `b.${column}`))
      .where(`b.outcome = 'succeeded'`)
      .orderBy('b.createdAt', 'DESC')
      .addOrderBy('b.id', 'DESC')
      .getMany();
    return rows.map(backupView);
  }

  async summary(): Promise<BackupsSummary> {
    const stored = await this.list();
    const last = await this.repo
      .createQueryBuilder('b')
      .select(['b.createdAt', 'b.outcome', 'b.trigger', 'b.reason'])
      .orderBy('b.createdAt', 'DESC')
      .getOne();
    return {
      lastSuccessfulAt: stored[0]?.createdAt ?? null,
      lastAttempt: last
        ? { at: last.createdAt, outcome: last.outcome, trigger: last.trigger, reason: last.reason }
        : null,
      nextScheduledAt: this.nextScheduledAt,
      retention: BACKUP_RETENTION,
      stored,
    };
  }

  /** The encrypted file, as stored: the ciphertext only, with a download name. */
  async download(id: string): Promise<{ filename: string; file: Buffer }> {
    const row = await this.repo.findOneBy({ id, outcome: 'succeeded' });
    if (!row?.blob) throw new NotFoundException({ code: 'not_found', message: 'There is no such backup.' });
    const date = row.createdAt.slice(0, 10);
    return {
      filename: `attraccess-matter-${date}-${row.id.slice(0, 8)}${FILE_EXTENSION}`,
      file: Buffer.from(row.blob),
    };
  }

  /** The stored file for a restore. */
  async fileOf(id: string): Promise<Buffer | null> {
    const row = await this.repo.findOneBy({ id, outcome: 'succeeded' });
    return row?.blob ? Buffer.from(row.blob) : null;
  }
}

function failureOf(error: unknown): BackupFailureReason {
  const code = sidecarCode(error);
  if (code === 'insecure_transport') return 'insecure_transport';
  if (code === 'busy') return 'sidecar_busy';
  if (code === 'recovery_required' || code === 'not_found') return 'recovery_required';
  if (code === 'fabric_absent') return 'no_fabric';
  if (code === 'sidecar_unavailable' || code === 'timeout' || code === 'network') return 'sidecar_unavailable';
  return 'sidecar_error';
}
