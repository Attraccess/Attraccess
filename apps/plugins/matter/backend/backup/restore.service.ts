import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { sqlitePersistence } from '@attraccess/plugins-backend-sdk/sqlite';
import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  type HttpException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MatterConnectionService } from '../connection/connection.service';
import { DeviceAuditService, type AuditActor } from '../devices/audit.service';
import { MatterFabric as MatterFabricEntity } from '../devices/entities';
import { MatterReconciliationService } from '../devices/reconciliation.service';
import { conflict, sidecarCode, unprocessable } from '../fabric/errors';
import type { SidecarFabric } from '../fabric/facts';
import { MatterFabricService } from '../fabric/fabric.service';
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
import {
  DEFAULT_ROLLBACK_TIMING,
  RESTORE_ROLLBACK_TIMING,
  RestoreCommitter,
  type RollbackTiming,
} from './restore-commit';
import {
  LEFT_UNCHANGED,
  RESTORE_MESSAGES as MESSAGES,
  type Pending,
  type RestorePreflight,
  type RestoreResult,
  type RestoreSource,
  type RestoreValidation,
  type RestoreValidationCode,
} from './restore.types';
import { tablesAreAcceptable } from './tables';

export { RESTORE_ROLLBACK_TIMING, type RollbackOutcome, type RollbackTiming } from './restore-commit';
export type {
  RestorePreflight,
  RestoreResult,
  RestoreSource,
  RestoreValidation,
  RestoreValidationCode,
} from './restore.types';

const VALIDATION_TTL_MS = 15 * 60_000;
export const RESTORE_VALIDATION_TTL = Symbol.for('attraccess.matter.restore-ttl');

type Opened = { header: FileHeader; body: BackupBody; suppliedKey: Buffer | null };
type Refuse = (code: RestoreValidationCode) => Promise<never>;
type ConfirmRefusal = 'confirmation_required' | 'preflight_changed' | 'pre_restore_backup_failed';

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
  private readonly committer: RestoreCommitter;

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
    @Optional()
    @Inject(RESTORE_ROLLBACK_TIMING)
    rollbackTiming: RollbackTiming = DEFAULT_ROLLBACK_TIMING,
  ) {
    this.committer = new RestoreCommitter(context, connectionService, guard, audit, rollbackTiming);
  }

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
   * changed. While a restore runs it is a 409 `busy`: the sidecar keeps one stage, and a new one would replace the
   * stage being restored.
   */
  async validate(
    source: RestoreSource,
    recoveryKey: string | undefined,
    principal: PluginAuditPrincipal,
  ): Promise<RestoreValidation> {
    const audited = { ref: randomUUID() };
    // The validation ID doubles as the operation ID: the check, the confirmation, the outcome and a cancel share it.
    const actor = this.audit.actorFor(principal);
    const refuse: Refuse = (code) => this.refused(code, audited.ref, actor, unprocessable(code, MESSAGES[code]));
    if (this.running) await this.refuseBusy(audited.ref, actor);

    const status = this.connection.status();
    if (status.state !== 'connected') return refuse('sidecar_unavailable');
    if (status.insecureTransport) return refuse('insecure_transport');

    const file = await this.load(source);
    if (!file) throw new NotFoundException({ code: 'not_found', message: 'There is no such backup.' });
    const opened = await this.open(file, recoveryKey, audited, refuse);
    if (
      !tablesAreAcceptable(
        sqlitePersistence(this.context).getRepository(MatterFabricEntity).manager,
        opened.body.tables,
      )
    ) {
      return refuse('incompatible_schema');
    }

    const preflight = await this.preflight(opened.header.fabricId);
    // Checked again right before staging: a restore may have started while the file was being read.
    if (this.running) await this.refuseBusy(audited.ref, actor);
    this.running = true;
    let validation: RestoreValidation;
    try {
      const stageId = await this.stage(opened.body, refuse);
      validation = await this.keep(opened, stageId, preflight, principal, actor.operationId);
    } finally {
      this.running = false;
    }
    await this.audit.record(
      'matter.restore_validated',
      actor,
      { type: 'matter.backup', ref: audited.ref },
      { backupRef: audited.ref, fabricGeneration: opened.header.fabricGeneration, kind: preflight.kind },
    );
    return validation;
  }

  /** Aborts the staged restore of a validation. */
  async cancel(validationId: string, principal: PluginAuditPrincipal): Promise<void> {
    const pending = this.pending;
    if (!pending || pending.validationId !== validationId || pending.userId !== principal.userId) return;
    await this.discardPending();
    const ref = pending.header.backupId;
    await this.audit.record(
      'matter.restore_cancelled',
      this.audit.actorFor(principal, validationId),
      { type: 'matter.backup', ref },
      { backupRef: ref },
    );
  }

  private async refused(
    reason: RestoreValidationCode | 'busy',
    ref: string,
    actor: AuditActor,
    error: HttpException,
  ): Promise<never> {
    await this.audit.record(
      'matter.restore_refused',
      actor,
      { type: 'matter.backup', ref },
      { backupRef: ref, reason },
      'failed',
    );
    throw error;
  }

  private refuseBusy(ref: string, actor: AuditActor): Promise<never> {
    return this.refused(
      'busy',
      ref,
      actor,
      conflict('busy', 'A restore is in progress. Check the backup again once it has finished.'),
    );
  }

  private async load(source: RestoreSource): Promise<Buffer | null> {
    if (source.type === 'stored') return this.backups.fileOf(source.backupId);
    return Buffer.from(source.contentBase64, 'base64');
  }

  /** Reads, authenticates and checks the file. Nothing is staged before all of this passed. */
  private async open(
    file: Buffer,
    recoveryKey: string | undefined,
    audited: { ref: string },
    refuse: Refuse,
  ): Promise<Opened> {
    try {
      const header = readHeader(file);
      audited.ref = header.backupId;
      const suppliedKey = recoveryKey !== undefined && recoveryKey.trim() !== '' ? parseRecoveryKey(recoveryKey) : null;
      const key = suppliedKey ?? (await this.storedKey(header));
      if (!key) return await refuse('key_required');
      const { body } = decryptBackup(file, key);
      assertCompatible(header, { pluginMigration: await this.migrationReader() });
      return { header, body, suppliedKey };
    } catch (error) {
      if (error instanceof BackupFormatError) return refuse(error.code);
      if (error instanceof BackupIncompatibleError) return refuse(error.code);
      if (error instanceof InvalidRecoveryKeyError) return refuse('wrong_key');
      throw error;
    }
  }

  /** The installation's own key with the ID the file names, current or retired. */
  private async storedKey(header: FileHeader): Promise<Buffer | null> {
    try {
      return (await this.keys.keyById(header.recoveryKeyId))?.key ?? null;
    } catch {
      return null;
    }
  }

  private async stage(body: BackupBody, refuse: Refuse): Promise<string> {
    try {
      const staged = await this.connection.request('backup.restore.stage', {
        body: { header: body.sidecar.header, payload: body.sidecar.payload },
        timeoutMs: BACKUP_TIMEOUT_MS,
      });
      return staged.stageId;
    } catch (error) {
      const code = sidecarCode(error);
      if (code === 'insecure_transport') return refuse('insecure_transport');
      if (code === 'sidecar_unavailable' || code === 'timeout' || code === 'network')
        return refuse('sidecar_unavailable');
      return refuse('stage_failed');
    }
  }

  /** Makes the staged backup the one pending validation, replacing an earlier one. */
  private async keep(
    opened: Opened,
    stageId: string,
    preflight: RestorePreflight,
    principal: PluginAuditPrincipal,
    validationId: string,
  ): Promise<RestoreValidation> {
    await this.discardPending();
    const { header } = opened;
    const expiresAt = new Date(Date.now() + this.validationTtlMs);
    const timer = setTimeout(() => void this.expire(validationId), this.validationTtlMs);
    timer.unref();
    this.pending = { validationId, userId: principal.userId, ...opened, stageId, preflight, timer };
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
        consistent: header.consistent !== false,
      },
      preflight,
    };
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
    const actor = this.audit.actorFor(principal, validationId);
    const refuse = async (code: ConfirmRefusal, message: string) => {
      await this.audit.record(
        'matter.restore_refused',
        actor,
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
        return await this.apply(pending, now, actor, refuse);
      } catch (error) {
        // Whatever the outcome, settle again whether the sidecar and the plugin's records agree. A restore of unknown
        // outcome may still land right after this check, so this one does not count as the sidecar having settled.
        this.guard.busy = false;
        this.guard.restoring = false;
        await this.fabric.detect('connect', { keepOutcomeUnknown: true }).catch(() => undefined);
        throw error;
      }
    } finally {
      this.running = false;
    }
  }

  private async apply(
    pending: Pending,
    preflight: RestorePreflight,
    actor: AuditActor,
    refuse: (code: 'pre_restore_backup_failed', message: string) => Promise<Error>,
  ): Promise<RestoreResult> {
    const ref = pending.header.backupId;
    // Every entry of the restore, including the backups, key and reconciliation it starts, carries its validation ID.
    // Any healthy fabric is backed up first, also one the plugin does not agree with while it is in recovery.
    const needsBackup = preflight.sidecarState === 'initialized';
    if (this.guard.recoveryRequired) await this.fabric.auditRecoveryChoice('restore', actor);
    await this.audit.record(
      'matter.restore_confirmed',
      actor,
      { type: 'matter.backup', ref },
      {
        backupRef: ref,
        kind: preflight.kind,
        typedConfirmation: preflight.requiresTypedConfirmation,
        preRestoreBackup: needsBackup,
      },
    );
    if (needsBackup) await this.preRestoreBackup(pending.stageId, actor, refuse);

    await this.committer.commitAndRecord(pending, preflight.sidecarState, actor);
    await this.keepSuppliedKey(pending, actor);
    await this.fabric.detect('connect');
    await this.reconciliation.request(actor).catch(() => undefined);
    await this.backups.backup('restore', actor).catch(() => undefined);
    return { outcome: 'succeeded', status: await this.fabric.status() };
  }

  /**
   * In recovery the plugin's records disagree with the sidecar, so this backup takes the sidecar's snapshot and the
   * tables as they are. Without it (no recovery key, for example) nothing is restored.
   */
  private async preRestoreBackup(
    stageId: string,
    actor: AuditActor,
    refuse: (code: 'pre_restore_backup_failed', message: string) => Promise<Error>,
  ): Promise<void> {
    try {
      await this.backups.backup('pre_restore', actor, { allowInRecovery: this.guard.recoveryRequired });
    } catch {
      await this.committer.abortStage(stageId);
      throw await refuse(
        'pre_restore_backup_failed',
        `The backup of the current fabric failed, so nothing was restored. ${LEFT_UNCHANGED}`,
      );
    }
  }

  /**
   * Disaster recovery onto an installation without a recovery key: the key the administrator restored with becomes
   * the current one, so the backups after the restore can be made. It never leaves this service in a response.
   */
  private async keepSuppliedKey(pending: Pending, actor: AuditActor): Promise<void> {
    if (!pending.suppliedKey) return;
    try {
      await this.keys.adopt(pending.suppliedKey, pending.header.recoveryKeyId, actor);
    } catch {
      this.context.logger.warn?.('The recovery key used for the restore could not be stored.');
    }
  }
}
