import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
  type OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MatterConnectionService } from '../connection/connection.service';
import { DeviceAuditService } from '../devices/audit.service';
import { MatterFabric as MatterFabricEntity } from '../devices/entities';
import { MatterReconciliationService } from '../devices/reconciliation.service';
import { runTransaction } from '../fabric/db';
import { conflict, sidecarCode, unprocessable } from '../fabric/errors';
import { factsOf, recordFacts, recordedFabricRow, type SidecarFabric } from '../fabric/facts';
import { MatterFabricService, type FabricBackupStatus } from '../fabric/fabric.service';
import { MatterFabricGuard } from '../fabric/guard';
import { RecoveryKeyService } from '../fabric/recovery-key.service';
import { PLUGIN_MIGRATION_READER, type PluginMigrationReader } from '../fabric/tokens';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { BACKUP_TIMEOUT_MS, MatterBackupService } from './backup.service';
import {
  BackupFormatError,
  BackupIncompatibleError,
  assertCompatible,
  decryptBackup,
  readHeader,
  type BackupBody,
  type FileHeader,
} from './format';
import { InvalidRecoveryKeyError, parseRecoveryKey } from './recovery-key';
import { replaceTables, tablesAreAcceptable } from './tables';

export type RestoreSource = { type: 'stored'; backupId: string } | { type: 'upload'; contentBase64: string };

export type RestoreValidationCode =
  | 'key_required'
  | 'wrong_key'
  | 'corrupt'
  | 'truncated'
  | 'incompatible_format'
  | 'incompatible_schema'
  | 'incompatible_migration'
  | 'incompatible_version'
  | 'stage_failed'
  | 'insecure_transport'
  | 'sidecar_unavailable';

export type RestorePreflight = {
  sidecarState: 'uninitialized' | 'recovery_required' | 'initialized';
  /** `plain`: nothing healthy is replaced; `rollback`: the same fabric at an earlier point; `replacement`: another one. */
  kind: 'plain' | 'rollback' | 'replacement';
  currentFabricId: string | null;
  requiresTypedConfirmation: boolean;
  /** The healthy fabric's ID the administrator must type to confirm overwriting it. */
  confirmationFabricId: string | null;
};

export type RestoreValidation = {
  validationId: string;
  expiresAt: string;
  backup: {
    backupId: string;
    createdAt: string;
    pluginVersion: string;
    sidecarVersion: string;
    fabricId: string;
    rootCertFingerprint: string;
    fabricGeneration: number;
    recoveryKeyId: string;
  };
  preflight: RestorePreflight;
};

export type RestoreResult = { outcome: 'succeeded'; status: FabricBackupStatus };

const MESSAGES: Record<RestoreValidationCode, string> = {
  key_required: 'This backup was encrypted with a recovery key that this installation does not have. Enter it.',
  wrong_key: 'The recovery key does not match this backup.',
  corrupt: 'The backup is damaged or has been modified.',
  truncated: 'The backup file is incomplete.',
  incompatible_format: 'This is not a backup this version can read.',
  incompatible_schema: 'The backup uses a different Matter storage layout than this installation.',
  incompatible_migration: 'The backup was made with a different database layout of the Matter plugin.',
  incompatible_version:
    'The backup was made with a release combination of the Matter plugin and sidecar that is not supported.',
  stage_failed: 'The Matter sidecar did not accept the backup.',
  insecure_transport:
    'The connection to the Matter sidecar is plain HTTP to another machine. Restores carry fabric secrets and need HTTPS.',
  sidecar_unavailable: 'The Matter sidecar could not be reached.',
};

const LEFT_UNCHANGED = 'Your installation was left unchanged.';
const VALIDATION_TTL_MS = 15 * 60_000;
export const RESTORE_VALIDATION_TTL = Symbol.for('attraccess.matter.restore-ttl');

type Pending = {
  validationId: string;
  userId: number;
  header: FileHeader;
  body: BackupBody;
  stageId: string;
  preflight: RestorePreflight;
  timer: NodeJS.Timeout;
};

/**
 * Restores a backup: validate (nothing live changes) -> preflight -> typed confirmation when a healthy fabric would
 * be overwritten -> pre-restore backup -> sidecar stage/commit -> plugin tables replaced in one transaction ->
 * finalize. Any failure before the end puts the sidecar back, and the plugin tables are touched only after the
 * sidecar committed. It never logs or returns the recovery key or the backup's content.
 */
@Injectable()
export class MatterRestoreService implements OnModuleDestroy {
  private pending: Pending | null = null;
  private running = false;

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(MatterConnectionService) private readonly connectionService: Pick<MatterConnectionService, 'connection'>,
    @Inject(RecoveryKeyService) private readonly keys: RecoveryKeyService,
    @Inject(MatterBackupService) private readonly backups: MatterBackupService,
    @Inject(MatterFabricService) private readonly fabric: MatterFabricService,
    @Inject(MatterFabricGuard) private readonly guard: MatterFabricGuard,
    @Inject(DeviceAuditService) private readonly audit: DeviceAuditService,
    @Inject(MatterReconciliationService) private readonly reconciliation: MatterReconciliationService,
    @Inject(PLUGIN_MIGRATION_READER) private readonly migrationReader: PluginMigrationReader,
    @Optional() @Inject(RESTORE_VALIDATION_TTL) private readonly validationTtlMs: number = VALIDATION_TTL_MS,
  ) {}

  private get connection() {
    return this.connectionService.connection;
  }

  onModuleDestroy(): void {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
  }

  // --- validate -----------------------------------------------------------------------------------------------------

  /**
   * Checks everything that can be checked without changing anything, then stages the snapshot on the sidecar (which
   * does not touch its live storage). Any problem is a 422 `{ code, message }` before a byte of the installation is
   * changed.
   */
  async validate(
    source: RestoreSource,
    recoveryKey: string | undefined,
    principal: PluginAuditPrincipal,
  ): Promise<RestoreValidation> {
    let ref: string = randomUUID();
    const refuse = async (code: RestoreValidationCode): Promise<never> => {
      await this.audit.record(
        'matter.restore_refused',
        principal,
        { type: 'matter.backup', ref },
        { backupRef: ref, reason: code },
        'failed',
      );
      throw unprocessable(code, MESSAGES[code]);
    };

    const status = this.connection.status();
    if (status.state !== 'connected') return refuse('sidecar_unavailable');
    if (status.insecureTransport) return refuse('insecure_transport');

    const file = await this.load(source);
    if (!file) throw new NotFoundException({ code: 'not_found', message: 'There is no such backup.' });

    let header: FileHeader;
    let body: BackupBody;
    try {
      header = readHeader(file);
      ref = header.backupId;
      const key = await this.keyFor(header, recoveryKey);
      if (!key) return await refuse('key_required');
      ({ body } = decryptBackup(file, key));
      assertCompatible(header, { pluginMigration: await this.migrationReader() });
    } catch (error) {
      if (error instanceof BackupFormatError) return refuse(error.code);
      if (error instanceof BackupIncompatibleError) return refuse(error.code);
      if (error instanceof InvalidRecoveryKeyError) return refuse('wrong_key');
      throw error;
    }
    if (!tablesAreAcceptable(this.context.getRepository(MatterFabricEntity).manager, body.tables)) {
      return refuse('incompatible_schema');
    }

    const preflight = await this.preflight(header.fabricId);
    let stageId: string;
    try {
      const staged = await this.connection.request('backup.restore.stage', {
        body: { header: body.sidecar.header, payload: body.sidecar.payload },
        timeoutMs: BACKUP_TIMEOUT_MS,
      });
      stageId = staged.stageId;
    } catch (error) {
      const code = sidecarCode(error);
      if (code === 'insecure_transport') return refuse('insecure_transport');
      if (code === 'sidecar_unavailable' || code === 'timeout' || code === 'network')
        return refuse('sidecar_unavailable');
      return refuse('stage_failed');
    }

    await this.discardPending();
    const validationId = randomUUID();
    const expiresAt = new Date(Date.now() + this.validationTtlMs);
    const timer = setTimeout(() => void this.expire(validationId), this.validationTtlMs);
    timer.unref();
    this.pending = { validationId, userId: principal.userId, header, body, stageId, preflight, timer };
    await this.audit.record(
      'matter.restore_validated',
      principal,
      { type: 'matter.backup', ref },
      { backupRef: ref, fabricGeneration: header.fabricGeneration, kind: preflight.kind },
    );
    return {
      validationId,
      expiresAt: expiresAt.toISOString(),
      backup: {
        backupId: header.backupId,
        createdAt: header.createdAt,
        pluginVersion: header.pluginVersion,
        sidecarVersion: header.sidecarVersion,
        fabricId: header.fabricId,
        rootCertFingerprint: header.rootCertFingerprint,
        fabricGeneration: header.fabricGeneration,
        recoveryKeyId: header.recoveryKeyId,
      },
      preflight,
    };
  }

  /** Aborts the staged restore of a validation. */
  async cancel(validationId: string, principal: PluginAuditPrincipal): Promise<void> {
    const pending = this.pending;
    if (!pending || pending.validationId !== validationId || pending.userId !== principal.userId) return;
    await this.discardPending();
  }

  private async load(source: RestoreSource): Promise<Buffer | null> {
    if (source.type === 'stored') return this.backups.fileOf(source.backupId);
    return Buffer.from(source.contentBase64, 'base64');
  }

  /** The supplied key when there is one, else the installation's own key with the ID the file names. */
  private async keyFor(header: FileHeader, supplied: string | undefined): Promise<Buffer | null> {
    if (supplied !== undefined && supplied.trim() !== '') return parseRecoveryKey(supplied);
    try {
      return (await this.keys.keyById(header.recoveryKeyId))?.key ?? null;
    } catch {
      return null;
    }
  }

  private async preflight(backupFabricId: string): Promise<RestorePreflight> {
    let sidecar: SidecarFabric;
    try {
      sidecar = await this.connection.request('fabric.get');
    } catch {
      throw unprocessable('sidecar_unavailable', MESSAGES.sidecar_unavailable);
    }
    const initialized = sidecar.state === 'initialized';
    return {
      sidecarState: sidecar.state,
      kind: !initialized ? 'plain' : sidecar.fabricId === backupFabricId ? 'rollback' : 'replacement',
      currentFabricId: initialized ? sidecar.fabricId : null,
      requiresTypedConfirmation: initialized,
      confirmationFabricId: initialized ? sidecar.fabricId : null,
    };
  }

  private async expire(validationId: string): Promise<void> {
    if (this.pending?.validationId === validationId && !this.running) await this.discardPending();
  }

  private async discardPending(): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timer);
    await this.connection
      .request('backup.restore.abort', { body: { stageId: pending.stageId } })
      .catch(() => undefined);
  }

  // --- confirm ------------------------------------------------------------------------------------------------------

  async confirm(
    validationId: string,
    confirmFabricId: string | undefined,
    principal: PluginAuditPrincipal,
  ): Promise<RestoreResult> {
    const pending = this.pending;
    if (!pending || pending.validationId !== validationId || pending.userId !== principal.userId) {
      throw conflict('validation_expired', 'This restore check has expired. Check the backup again.');
    }
    if (this.running) throw conflict('busy', 'A restore is already in progress.');
    const ref = pending.header.backupId;
    const refuse = async (
      code: 'confirmation_required' | 'preflight_changed' | 'pre_restore_backup_failed',
      message: string,
    ) => {
      await this.audit.record(
        'matter.restore_refused',
        principal,
        { type: 'matter.backup', ref },
        { backupRef: ref, reason: code },
        'failed',
      );
      return conflict(code, message);
    };

    this.running = true;
    try {
      const now = await this.preflight(pending.header.fabricId).catch(() => null);
      if (
        !now ||
        now.sidecarState !== pending.preflight.sidecarState ||
        now.currentFabricId !== pending.preflight.currentFabricId
      ) {
        await this.discardPending();
        throw await refuse(
          'preflight_changed',
          'The sidecar changed since the backup was checked. Check the backup again.',
        );
      }
      if (now.requiresTypedConfirmation && (confirmFabricId ?? '').trim() !== now.confirmationFabricId) {
        throw await refuse(
          'confirmation_required',
          'Restoring replaces the current fabric. Type its fabric ID to confirm.',
        );
      }
      // From here on the pending validation is consumed: success or failure, a new check is needed.
      this.pending = null;
      clearTimeout(pending.timer);
      try {
        return await this.apply(pending, now, principal, refuse);
      } catch (error) {
        // Whatever the outcome, settle again whether the sidecar and the plugin's records agree.
        this.guard.busy = false;
        await this.fabric.detect('connect').catch(() => undefined);
        throw error;
      }
    } finally {
      this.running = false;
    }
  }

  private async apply(
    pending: Pending,
    preflight: RestorePreflight,
    principal: PluginAuditPrincipal,
    refuse: (code: 'pre_restore_backup_failed', message: string) => Promise<Error>,
  ): Promise<RestoreResult> {
    const ref = pending.header.backupId;
    const { stageId } = pending;
    const needsBackup = preflight.sidecarState === 'initialized' && !this.guard.recoveryRequired;
    await this.audit.record(
      'matter.restore_confirmed',
      principal,
      { type: 'matter.backup', ref },
      {
        backupRef: ref,
        kind: preflight.kind,
        typedConfirmation: preflight.requiresTypedConfirmation,
        preRestoreBackup: needsBackup,
      },
    );

    if (needsBackup) {
      try {
        await this.backups.backup('pre_restore', principal);
      } catch {
        await this.abortStage(stageId);
        throw await refuse(
          'pre_restore_backup_failed',
          `The backup of the current fabric failed, so nothing was restored. ${LEFT_UNCHANGED}`,
        );
      }
    }

    this.guard.busy = true;
    let committed;
    try {
      try {
        committed = await this.connection.request('backup.restore.commit', {
          body: { stageId },
          timeoutMs: BACKUP_TIMEOUT_MS,
        });
      } catch (error) {
        // `restore_failed`: the sidecar swapped back itself. Anything else leaves its state unknown, so ask it to
        // roll back (which does nothing when it never committed).
        if (sidecarCode(error) !== 'restore_failed') await this.rollback(stageId);
        await this.abortStage(stageId);
        await this.audit.record(
          'matter.restore_failed',
          principal,
          { type: 'matter.backup', ref },
          { backupRef: ref },
          'failed',
        );
        throw conflict('restore_failed', `The Matter sidecar could not apply the backup. ${LEFT_UNCHANGED}`);
      }
      const facts = factsOf(committed.fabric);
      if (committed.state !== 'committed' || !facts) {
        await this.rollback(stageId);
        await this.audit.record(
          'matter.restore_failed',
          principal,
          { type: 'matter.backup', ref },
          { backupRef: ref },
          'failed',
        );
        throw conflict('restore_failed', `The restored fabric could not be verified. ${LEFT_UNCHANGED}`);
      }

      try {
        await runTransaction(this.context, async (manager) => {
          if (!tablesAreAcceptable(manager, pending.body.tables)) throw new Error('unacceptable tables');
          await replaceTables(manager, pending.body.tables);
          await recordFacts(manager, facts);
        });
      } catch {
        const rolledBack = await this.rollback(stageId);
        await this.audit.record(
          rolledBack ? 'matter.restore_rolled_back' : 'matter.restore_failed',
          principal,
          { type: 'matter.backup', ref },
          { backupRef: ref },
          'failed',
        );
        if (!rolledBack) {
          throw new InternalServerErrorException({
            code: 'rollback_failed',
            message:
              'The restore failed and the Matter sidecar could not be rolled back automatically. ' +
              'Check the sidecar and restore again.',
          });
        }
        throw conflict('rolled_back', `The restore failed and was rolled back. ${LEFT_UNCHANGED}`);
      }

      await this.connection
        .request('backup.restore.finalize', { body: { stageId } })
        .catch(() => this.context.logger.warn?.('The Matter sidecar did not confirm cleaning up after a restore.'));
      await this.audit.record(
        'matter.restore_succeeded',
        principal,
        { type: 'matter.backup', ref },
        { backupRef: ref, fabricGeneration: facts.fabricGeneration },
      );
    } finally {
      this.guard.busy = false;
    }

    await this.fabric.detect('connect');
    await this.reconciliation.request(principal).catch(() => undefined);
    await this.backups.backup('restore', principal).catch(() => undefined);
    return { outcome: 'succeeded', status: await this.fabric.status() };
  }

  private async abortStage(stageId: string): Promise<void> {
    await this.connection.request('backup.restore.abort', { body: { stageId } }).catch(() => undefined);
  }

  /**
   * Asks the sidecar to put its previous storage back. A rollback moves the sidecar's generation on, so the plugin
   * records the new value of the fabric it already knew: its own operation, not a mismatch. Returns false when the
   * sidecar could not roll back.
   */
  private async rollback(stageId: string): Promise<boolean> {
    try {
      const rolled = await this.connection.request('backup.restore.rollback', {
        body: { stageId },
        timeoutMs: BACKUP_TIMEOUT_MS,
      });
      const facts = factsOf(rolled.fabric);
      if (facts) {
        await runTransaction(this.context, async (manager) => {
          const recorded = await recordedFabricRow(manager);
          if (recorded?.fabricId === facts.fabricId) await recordFacts(manager, facts);
        });
      }
      return true;
    } catch {
      return false;
    }
  }
}
