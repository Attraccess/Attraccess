import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { MatterBackupService, type BackupsSummary } from '../backup/backup.service';
import { MatterConnectionService } from '../connection/connection.service';
import { DeviceAuditService } from '../devices/audit.service';
import { MatterFabric } from '../devices/entities';
import { MatterReconciliationService } from '../devices/reconciliation.service';
import { PLUGIN_CONTEXT } from '../plugin-context';
import { runTransaction } from './db';
import { NOT_CONNECTED, conflict, sidecarFailure } from './errors';
import { factsOf, factsOfRow, recordFacts, recordedFabricRow, type FabricFacts, type SidecarFabric } from './facts';
import { MatterFabricGuard } from './guard';
import { detectMismatch, type MismatchKind } from './mismatch';
import { RecoveryKeyService, type RecoveryKeyReveal, type RecoveryKeyView } from './recovery-key.service';

export type FabricBackupStatus = {
  sidecar: {
    reachable: boolean;
    state: 'uninitialized' | 'initialized' | 'recovery_required' | 'unknown';
    reason: string | null;
    fabricId: string | null;
    rootCertFingerprint: string | null;
    fabricGeneration: number | null;
    storageInstanceId: string | null;
  };
  recorded: FabricFacts | null;
  recovery: { required: boolean; mismatch: MismatchKind | null };
  recoveryKey: RecoveryKeyView;
  backups: BackupsSummary;
  actions: {
    canCreateFabric: boolean;
    canBackup: boolean;
    canRestore: boolean;
    canAcceptSidecar: boolean;
    canStartNew: boolean;
  };
};

export type CreateResult = { status: FabricBackupStatus; recoveryKey: RecoveryKeyReveal | null };
export type DetectMode = 'connect' | 'event';

const DEFAULT_LABEL = 'Attraccess';

/**
 * The plugin's view of the controller fabric: what the sidecar has against what the plugin recorded. It creates the
 * fabric when an administrator asks, detects every mismatch on each (re)connect and `fabric.changed` event, and in a
 * mismatch blocks fabric changes until an administrator settles it. It never creates, restores or overwrites a
 * fabric on its own.
 */
@Injectable()
export class MatterFabricService implements OnModuleInit, OnModuleDestroy {
  private readonly unsubscribe: (() => void)[] = [];
  private readonly advanced = new Set<(facts: FabricFacts) => void>();
  private chain: Promise<unknown> = Promise.resolve();
  private auditedMismatch: MismatchKind | null = null;

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(MatterConnectionService) private readonly connectionService: Pick<MatterConnectionService, 'connection'>,
    @Inject(MatterFabricGuard) private readonly guard: MatterFabricGuard,
    @Inject(RecoveryKeyService) private readonly keys: RecoveryKeyService,
    @Inject(MatterBackupService) private readonly backups: MatterBackupService,
    @Inject(DeviceAuditService) private readonly audit: DeviceAuditService,
    @Inject(MatterReconciliationService) private readonly reconciliation: MatterReconciliationService,
  ) {}

  private get connection() {
    return this.connectionService.connection;
  }

  private get manager() {
    return this.context.getRepository(MatterFabric).manager;
  }

  onModuleInit(): void {
    const connection = this.connection;
    this.unsubscribe.push(
      connection.onStateChange((status) => {
        if (status.state === 'connected') this.detect('connect').catch(() => undefined);
      }),
      connection.onEvent(({ event }) => {
        if (event.type === 'fabric.changed') this.detect('event').catch(() => undefined);
      }),
    );
    if (connection.status().state === 'connected') this.detect('connect').catch(() => undefined);
  }

  onModuleDestroy(): void {
    for (const stop of this.unsubscribe.splice(0)) stop();
  }

  /** Called when a legitimate `fabric.changed` advanced the generation the plugin recorded. */
  onAdvanced(handler: (facts: FabricFacts) => void): () => void {
    this.advanced.add(handler);
    return () => this.advanced.delete(handler);
  }

  assertFabricMutationAllowed(): void {
    this.guard.assertFabricMutationAllowed();
  }

  // --- detection ----------------------------------------------------------------------------------------------------

  /**
   * Compares the sidecar's fabric with the plugin's record and updates the plugin's `recovery.required` state. Runs
   * one at a time. When the sidecar cannot be asked, the state is left as it was. Returns the resulting mismatch.
   */
  detect(mode: DetectMode = 'connect'): Promise<MismatchKind | null> {
    const run = this.chain.then(() => this.evaluate(mode));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async evaluate(mode: DetectMode): Promise<MismatchKind | null> {
    // The plugin's own create/restore changes the sidecar before it records the result: not judged halfway.
    if (this.guard.busy) return this.guard.mismatch;
    let sidecar: SidecarFabric;
    try {
      if (this.connection.status().state !== 'connected') return this.guard.mismatch;
      sidecar = await this.connection.request('fabric.get');
    } catch {
      return this.guard.mismatch;
    }
    try {
      const recorded = factsOfRow(await recordedFabricRow(this.manager));
      const detection = detectMismatch(sidecar, recorded);
      if (detection.kind === null) {
        if (detection.adopt) await runTransaction(this.context, (m) => recordFacts(m, detection.adopt as FabricFacts));
        this.settle(null);
        return null;
      }
      const facts = factsOf(sidecar);
      if (mode === 'event' && detection.kind === 'generation_ahead' && !this.guard.recoveryRequired && facts) {
        // The same fabric in the same storage moved on while the plugin was watching: a change it asked for or
        // one it was told about. Record it; a gap in what the plugin saw is handled by the connect check.
        await runTransaction(this.context, (m) => recordFacts(m, facts));
        for (const handler of this.advanced) handler(facts);
        return null;
      }
      this.settle(detection.kind);
      if (this.auditedMismatch !== detection.kind) {
        this.auditedMismatch = detection.kind;
        await this.audit.record(
          'matter.fabric_recovery_required',
          null,
          { type: 'matter.fabric', ref: (await recordedFabricRow(this.manager))?.id ?? 'fabric' },
          { mismatch: detection.kind },
        );
      }
      return detection.kind;
    } catch {
      this.context.logger.warn?.('The Matter fabric could not be compared with the sidecar.');
      return this.guard.mismatch;
    }
  }

  private settle(kind: MismatchKind | null): void {
    this.guard.set(kind);
    if (kind === null) this.auditedMismatch = null;
  }

  // --- status -------------------------------------------------------------------------------------------------------

  async status(): Promise<FabricBackupStatus> {
    const status = this.connection.status();
    const connected = status.state === 'connected';
    let fabric: SidecarFabric | null = null;
    if (connected) {
      try {
        fabric = await this.connection.request('fabric.get');
      } catch {
        fabric = null;
      }
    }
    const recorded = factsOfRow(await recordedFabricRow(this.manager));
    const key = await this.keys.view();
    const reachable = connected && fabric !== null;
    const state = fabric?.state ?? 'unknown';
    const required = this.guard.recoveryRequired;
    const secure = !status.insecureTransport;
    return {
      sidecar: {
        reachable,
        state,
        reason: fabric?.reason ?? null,
        fabricId: fabric?.fabricId ?? null,
        rootCertFingerprint: fabric?.rootCertFingerprint ?? null,
        fabricGeneration: fabric ? fabric.fabricGeneration : null,
        storageInstanceId: fabric?.storageInstanceId ?? null,
      },
      recorded,
      recovery: { required, mismatch: this.guard.mismatch },
      recoveryKey: key,
      backups: await this.backups.summary(),
      actions: {
        canCreateFabric: reachable && state === 'uninitialized' && !required && recorded === null,
        canBackup: reachable && state === 'initialized' && !required && secure && key.present,
        canRestore: reachable && secure,
        canAcceptSidecar: reachable && required && state === 'initialized',
        canStartNew: reachable && required && state === 'uninitialized',
      },
    };
  }

  // --- creating -----------------------------------------------------------------------------------------------------

  /** Creates the fabric (and the recovery key when there is none yet) and takes the first backup. */
  async create(label: string | undefined, principal: PluginAuditPrincipal): Promise<CreateResult> {
    this.guard.assertFabricMutationAllowed();
    const created = await this.createOnSidecar(label);
    const key = await this.ensureKey(principal);
    await this.audit.record(
      'matter.fabric_created',
      principal,
      { type: 'matter.fabric', ref: created.rowId },
      { fabricRef: created.rowId, fabricId: created.facts.fabricId, recoveryKeyCreated: key !== null },
    );
    await this.backupQuietly('fabric_created', principal);
    return { status: await this.status(), recoveryKey: key };
  }

  /** The recovery key for a fabric that exists but has none (an installation from before backups). */
  async generateRecoveryKey(principal: PluginAuditPrincipal): Promise<RecoveryKeyReveal> {
    const reveal = await this.keys.generate(principal);
    await this.backupQuietly('manual', principal);
    return reveal;
  }

  /** Replaces the recovery key and immediately takes a backup under the new one. */
  async rotateRecoveryKey(principal: PluginAuditPrincipal): Promise<RecoveryKeyReveal> {
    const reveal = await this.keys.rotate(principal);
    await this.backupQuietly('manual', principal);
    return reveal;
  }

  private async createOnSidecar(label: string | undefined): Promise<{ facts: FabricFacts; rowId: string }> {
    if (this.connection.status().state !== 'connected') throw conflict('sidecar_unavailable', NOT_CONNECTED);
    this.guard.busy = true;
    try {
      let result: SidecarFabric;
      try {
        result = await this.connection.request('fabric.create', {
          body: { label: label?.trim() || DEFAULT_LABEL },
        });
      } catch (error) {
        throw sidecarFailure(error);
      }
      const facts = factsOf(result);
      if (!facts) throw sidecarFailure(new Error('The sidecar did not report a fabric.'));
      const row = await runTransaction(this.context, (m) => recordFacts(m, facts, label?.trim() || DEFAULT_LABEL));
      this.settle(null);
      return { facts, rowId: row.id };
    } finally {
      this.guard.busy = false;
    }
  }

  private async ensureKey(principal: PluginAuditPrincipal): Promise<RecoveryKeyReveal | null> {
    if ((await this.keys.view()).present) return null;
    return this.keys.generate(principal);
  }

  private async backupQuietly(
    trigger: 'manual' | 'fabric_created' | 'fabric_changed',
    principal: PluginAuditPrincipal | null,
  ) {
    try {
      await this.backups.backup(trigger, principal);
    } catch {
      // Recorded as a failed attempt and audited by the backup service; the fabric operation itself succeeded.
    }
  }

  // --- recovery -----------------------------------------------------------------------------------------------------

  /** Recovery: keep what the sidecar has. The plugin's device records are reconciled with it. */
  async acceptSidecar(principal: PluginAuditPrincipal): Promise<FabricBackupStatus> {
    this.requireRecovery();
    const sidecar = await this.freshSidecar();
    const facts = factsOf(sidecar);
    if (sidecar.state !== 'initialized' || !facts) {
      throw conflict('sidecar_not_initialized', 'The sidecar has no healthy fabric to accept.');
    }
    await this.audit.record(
      'matter.recovery_action_chosen',
      principal,
      { type: 'matter.fabric', ref: 'accept' },
      {
        choice: 'accept_sidecar',
      },
    );
    this.guard.busy = true;
    try {
      await this.reconciliation.request(principal);
      await runTransaction(this.context, (m) => recordFacts(m, facts));
      this.settle(null);
    } finally {
      this.guard.busy = false;
    }
    await this.backupQuietly('fabric_changed', principal);
    return this.status();
  }

  /** Recovery: forget the old fabric and create a new one. Devices of the old fabric must be factory reset. */
  async startNew(label: string | undefined, principal: PluginAuditPrincipal): Promise<CreateResult> {
    this.requireRecovery();
    const sidecar = await this.freshSidecar();
    if (sidecar.state !== 'uninitialized') {
      throw conflict('sidecar_not_empty', 'A new fabric can only be started on a sidecar without one.');
    }
    await this.audit.record(
      'matter.recovery_action_chosen',
      principal,
      { type: 'matter.fabric', ref: 'start-new' },
      {
        choice: 'start_new',
      },
    );
    const created = await this.createOnSidecar(label);
    const key = await this.ensureKey(principal);
    await this.audit.record(
      'matter.fabric_created',
      principal,
      { type: 'matter.fabric', ref: created.rowId },
      { fabricRef: created.rowId, fabricId: created.facts.fabricId, recoveryKeyCreated: key !== null },
    );
    // The old fabric's devices are detached by the reconciliation, never matched to the new fabric's.
    await this.reconciliation.request(principal).catch(() => undefined);
    await this.backupQuietly('fabric_created', principal);
    return { status: await this.status(), recoveryKey: key };
  }

  private requireRecovery(): void {
    if (this.connection.status().state !== 'connected') throw conflict('sidecar_unavailable', NOT_CONNECTED);
    if (!this.guard.recoveryRequired) {
      throw conflict('recovery_not_required', 'The fabric does not need recovery.');
    }
  }

  private async freshSidecar(): Promise<SidecarFabric> {
    try {
      return await this.connection.request('fabric.get');
    } catch (error) {
      throw sidecarFailure(error);
    }
  }

  /** Whether backups and restores may use the connection. */
  insecureTransport(): boolean {
    return this.connection.status().insecureTransport;
  }
}
