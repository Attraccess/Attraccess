import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { InternalServerErrorException, type HttpException } from '@nestjs/common';
import type { MatterConnectionService } from '../connection/connection.service';
import type { DeviceAuditService } from '../devices/audit.service';
import { runTransaction } from '../fabric/db';
import { conflict, sidecarCode } from '../fabric/errors';
import { factsOf, recordFacts, recordedFabricRow, type FabricFacts } from '../fabric/facts';
import type { MatterFabricGuard } from '../fabric/guard';
import { BACKUP_TIMEOUT_MS } from './backup.service';
import { LEFT_UNCHANGED, type Pending, type RestorePreflight } from './restore.types';
import { replaceTables, tablesAreAcceptable } from './tables';

/**
 * How long a rollback keeps asking a sidecar that is still busy (or cannot be reached) before the outcome counts as
 * unknown, and the first pause between attempts (it doubles up to `maxRetryMs`).
 */
export type RollbackTiming = { windowMs: number; firstRetryMs: number; maxRetryMs: number };
export const RESTORE_ROLLBACK_TIMING = Symbol.for('attraccess.matter.restore-rollback-timing');
export const DEFAULT_ROLLBACK_TIMING: RollbackTiming = { windowMs: 3 * 60_000, firstRetryMs: 500, maxRetryMs: 15_000 };
/** Sidecar answers that say nothing about whether a commit happened: ask again. */
// `internal_error`: the sidecar could not write its rollback and changed nothing, so the rollback can be asked again.
const UNSETTLED = new Set(['busy', 'timeout', 'network', 'sidecar_unavailable', 'internal_error']);

/**
 * `rolled_back`: the sidecar put its previous storage back. `not_committed`: it had nothing to roll back, so the commit
 * never took effect. `failed`: the sidecar's state is unknown.
 */
export type RollbackOutcome = 'rolled_back' | 'not_committed' | 'failed';

/** The part of a pending validation the commit needs. */
export type StagedRestore = Pick<Pending, 'header' | 'body' | 'stageId'>;

/**
 * The commit side of a restore: commits the staged snapshot on the sidecar, replaces the plugin tables, and puts the
 * sidecar back (retrying for a bounded time) when anything after the commit fails.
 */
export class RestoreCommitter {
  /** The sidecar's state before the running restore: a rollback that ends there again did roll back. */
  private restoringFrom: RestorePreflight['sidecarState'] = 'initialized';

  constructor(
    private readonly context: PluginContext,
    private readonly connectionService: Pick<MatterConnectionService, 'connection'>,
    private readonly guard: MatterFabricGuard,
    private readonly audit: DeviceAuditService,
    private readonly rollbackTiming: RollbackTiming,
  ) {}

  private get connection() {
    return this.connectionService.connection;
  }

  /** Commits on the sidecar, then replaces the plugin tables. The guard stays busy until the outcome is settled. */
  async commitAndRecord(
    staged: StagedRestore,
    from: RestorePreflight['sidecarState'],
    principal: PluginAuditPrincipal,
  ): Promise<void> {
    const ref = staged.header.backupId;
    const { stageId } = staged;
    this.restoringFrom = from;
    this.guard.busy = true;
    this.guard.restoring = true;
    try {
      const facts = await this.commit(stageId, principal, ref);
      await this.replaceTables(staged, facts, principal);
      this.guard.outcomeUnknown = false;
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
      this.guard.restoring = false;
    }
  }

  async abortStage(stageId: string): Promise<void> {
    await this.connection.request('backup.restore.abort', { body: { stageId } }).catch(() => undefined);
  }

  private async commit(stageId: string, principal: PluginAuditPrincipal, ref: string): Promise<FabricFacts> {
    let committed;
    try {
      committed = await this.connection.request('backup.restore.commit', {
        body: { stageId },
        timeoutMs: BACKUP_TIMEOUT_MS,
      });
    } catch (error) {
      const outcome = await this.afterFailedCommit(sidecarCode(error), stageId);
      await this.abortStage(stageId);
      throw await this.notRestored(outcome, principal, ref, 'The Matter sidecar could not apply the backup.');
    }
    const facts = factsOf(committed.fabric);
    if (committed.state === 'committed' && facts) return facts;
    const outcome = await this.rollback(stageId);
    throw await this.notRestored(outcome, principal, ref, 'The restored fabric could not be verified.');
  }

  /**
   * `restore_failed`: the sidecar swapped back itself. `recovery_required`: it could not put its previous storage back
   * and needs recovery, so nothing is unchanged. Anything else leaves its state unknown, so ask it to roll back: it
   * answers `not_found` when it never committed, and `busy` while it is still committing.
   */
  private async afterFailedCommit(code: string, stageId: string): Promise<RollbackOutcome> {
    if (code === 'restore_failed') return 'not_committed';
    if (code === 'recovery_required') return 'failed';
    return this.rollback(stageId);
  }

  /**
   * Replaces the plugin tables and records the fabric the sidecar committed. A backup marked inconsistent keeps the
   * fabric record of its own tables instead, so the detection afterwards finds the mismatch it was taken in.
   */
  private async replaceTables(
    staged: StagedRestore,
    facts: FabricFacts,
    principal: PluginAuditPrincipal,
  ): Promise<void> {
    const ref = staged.header.backupId;
    try {
      await runTransaction(this.context, async (manager) => {
        if (!tablesAreAcceptable(manager, staged.body.tables)) throw new Error('unacceptable tables');
        await replaceTables(manager, staged.body.tables);
        if (staged.header.consistent !== false) await recordFacts(manager, facts);
      });
    } catch {
      // The sidecar committed, so `not_committed` here means it lost track of the restore: not "unchanged" either.
      if ((await this.rollback(staged.stageId)) !== 'rolled_back') throw await this.rollbackFailed(principal, ref);
      await this.audit.record(
        'matter.restore_rolled_back',
        principal,
        { type: 'matter.backup', ref },
        { backupRef: ref },
        'failed',
      );
      throw conflict('rolled_back', `The restore failed and was rolled back. ${LEFT_UNCHANGED}`);
    }
  }

  /** The answer for a commit that did not go through, by what the rollback achieved. */
  private async notRestored(
    outcome: RollbackOutcome,
    principal: PluginAuditPrincipal,
    ref: string,
    what: string,
  ): Promise<HttpException> {
    if (outcome === 'failed') return this.rollbackFailed(principal, ref);
    await this.audit.record(
      outcome === 'rolled_back' ? 'matter.restore_rolled_back' : 'matter.restore_failed',
      principal,
      { type: 'matter.backup', ref },
      { backupRef: ref },
      'failed',
    );
    return conflict('restore_failed', `${what} ${LEFT_UNCHANGED}`);
  }

  /**
   * The sidecar's state is unknown: it may still finish the restore. Until the plugin records a fabric itself, a
   * later `fabric.changed` is judged like a reconnect, so that restore cannot be taken for the plugin's own change.
   */
  private async rollbackFailed(principal: PluginAuditPrincipal, ref: string): Promise<HttpException> {
    this.guard.outcomeUnknown = true;
    await this.audit.record(
      'matter.restore_failed',
      principal,
      { type: 'matter.backup', ref },
      { backupRef: ref },
      'failed',
    );
    return new InternalServerErrorException({
      code: 'rollback_failed',
      message:
        'The restore failed and the Matter sidecar could not be rolled back automatically. ' +
        'Check the sidecar and restore again.',
    });
  }

  /**
   * Asks the sidecar to put its previous storage back, again while it is busy or out of reach, for a bounded time.
   */
  private async rollback(stageId: string): Promise<RollbackOutcome> {
    const { windowMs, firstRetryMs, maxRetryMs } = this.rollbackTiming;
    const deadline = Date.now() + windowMs;
    let wait = firstRetryMs;
    let outcome = await this.tryRollback(stageId);
    while (outcome === 'retry') {
      if (Date.now() + wait > deadline) return 'failed';
      await new Promise((resolve) => setTimeout(resolve, wait));
      wait = Math.min(wait * 2, maxRetryMs);
      outcome = await this.tryRollback(stageId);
    }
    return outcome;
  }

  /**
   * One rollback request. A sidecar that ends up needing recovery did not roll back (its state is unknown), unless it
   * needed recovery before the restore too.
   */
  private async tryRollback(stageId: string): Promise<RollbackOutcome | 'retry'> {
    let rolled;
    try {
      rolled = await this.connection.request('backup.restore.rollback', {
        body: { stageId },
        timeoutMs: BACKUP_TIMEOUT_MS,
      });
    } catch (error) {
      // `recovery_required` among the rest: the sidecar could not put its previous storage back.
      const code = sidecarCode(error);
      if (code === 'not_found') return 'not_committed';
      return UNSETTLED.has(code) ? 'retry' : 'failed';
    }
    if (rolled.state !== 'rolled_back') return 'failed';
    if (rolled.fabric.state === 'recovery_required' && this.restoringFrom !== 'recovery_required') return 'failed';
    await this.recordRolledBack(factsOf(rolled.fabric));
    return 'rolled_back';
  }

  /**
   * A rollback moves the sidecar's generation on, so the plugin records the new value of the fabric it already knew:
   * its own operation, not a mismatch.
   */
  private async recordRolledBack(facts: FabricFacts | null): Promise<void> {
    if (!facts) return;
    try {
      await runTransaction(this.context, async (manager) => {
        const recorded = await recordedFabricRow(manager);
        if (recorded?.fabricId === facts.fabricId) await recordFacts(manager, facts);
      });
    } catch {
      // The next comparison reports the generation the plugin missed as a mismatch.
      this.context.logger.warn?.('The Matter fabric after a rollback could not be recorded.');
    }
  }
}
