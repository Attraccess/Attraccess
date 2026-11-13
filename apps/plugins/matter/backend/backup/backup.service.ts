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
import { factsOfRow, recordedFabricRow } from '../fabric/facts';
import { MatterFabricGuard } from '../fabric/guard';
import { RecoveryKeyService, RecoveryKeyUnreadableError } from '../fabric/recovery-key.service';
import { PLUGIN_MIGRATION_READER, type PluginMigrationReader } from '../fabric/tokens';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { BackupTrigger, MatterBackup } from './entities';
import { FILE_EXTENSION, encryptBackup } from './format';
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

class BackupFailure extends Error {
  constructor(readonly reason: BackupFailureReason) {
    super(FAILURE_TEXT[reason]);
  }
}

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

  /**
   * Takes a backup now. Joins a backup that is already running, except for `pre_restore` and `restore`, which must
   * reflect the state at their own moment. `principal: null` is the plugin itself (schedule, events).
   */
  async backup(trigger: BackupTrigger, principal: PluginAuditPrincipal | null = null): Promise<BackupView> {
    if (this.guard.busy) throw conflict('busy', 'A restore is in progress.');
    while (this.inFlight) {
      if (trigger !== 'pre_restore' && trigger !== 'restore') return this.inFlight;
      await this.inFlight.catch(() => undefined);
    }
    const run = this.attempt(trigger, principal).finally(() => {
      if (this.inFlight === run) this.inFlight = undefined;
    });
    this.inFlight = run;
    return run;
  }

  private async attempt(trigger: BackupTrigger, principal: PluginAuditPrincipal | null): Promise<BackupView> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    try {
      const row = await this.produce(id, createdAt, trigger, principal?.userId ?? null);
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

  private async produce(id: string, createdAt: string, trigger: BackupTrigger, actor: number | null) {
    const connection = this.connectionService.connection;
    const status = connection.status();
    if (status.state !== 'connected') throw new BackupFailure('sidecar_unavailable');
    if (status.insecureTransport) throw new BackupFailure('insecure_transport');
    if (this.guard.recoveryRequired) throw new BackupFailure('recovery_required');
    let key;
    try {
      key = await this.keys.currentKey();
    } catch (error) {
      throw new BackupFailure(error instanceof RecoveryKeyUnreadableError ? 'recovery_key_unreadable' : 'internal');
    }
    if (!key) throw new BackupFailure('no_recovery_key');

    // The plugin's tables are read in one transaction together with the fabric record they must agree with; the
    // sidecar's snapshot is checked against that record afterwards.
    const { tables, recorded } = await runTransaction(this.context, async (manager) => ({
      recorded: factsOfRow(await recordedFabricRow(manager)),
      tables: await readTables(manager),
    }));
    if (!recorded) throw new BackupFailure('no_fabric');

    let snapshot;
    try {
      snapshot = await connection.request('backup.snapshot', { body: {}, timeoutMs: BACKUP_TIMEOUT_MS });
    } catch (error) {
      throw new BackupFailure(failureOf(error));
    }
    const header = snapshot.header;
    const after = factsOfRow(await recordedFabricRow(this.context.getRepository(MatterFabric).manager));
    const consistent =
      header.fabricId === recorded.fabricId &&
      header.fabricGeneration === recorded.fabricGeneration &&
      header.rootCertFingerprint === recorded.rootCertFingerprint &&
      header.storageInstanceId === recorded.storageInstanceId &&
      after !== null &&
      after.fabricId === recorded.fabricId &&
      after.fabricGeneration === recorded.fabricGeneration;
    if (!consistent) throw new BackupFailure('inconsistent');

    const pluginMigration = await this.migrationReader();
    if (!pluginMigration) throw new BackupFailure('internal');
    const file = encryptBackup(
      { sidecar: { header, payload: snapshot.payload }, tables },
      { backupId: id, createdAt, pluginVersion: this.context.manifest.version, pluginMigration },
      key.key,
    );
    return this.repo.save({
      id,
      createdAt,
      trigger,
      actor,
      outcome: 'succeeded',
      reason: null,
      sizeBytes: file.length,
      sha256: createHash('sha256').update(file).digest('hex'),
      formatVersion: 1,
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
      blob: file,
    });
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

  /** The newest stored backup's generation, for the "did the fabric change since" question. */
  async latestGeneration(): Promise<number | null> {
    return (await this.list())[0]?.fabricGeneration ?? null;
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
  if (code === 'sidecar_unavailable' || code === 'timeout' || code === 'network') return 'sidecar_unavailable';
  return 'sidecar_error';
}
