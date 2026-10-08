import { ConflictException, NotFoundException } from '@nestjs/common';

import { randomBytes } from 'node:crypto';

import { WagoController } from '../controllers/entity';

import { type CommissioningOperationGuard } from '../runtime/operation-guard';

import { WagoDeviceOperations } from '../runtime/device-operations';

import { WagoDeviceOperation } from '../runtime/managed/access.entity';

import { SSH_TIMEOUT_MS } from './model';

import { WagoRecoveryError } from '../runtime/recovery-error';

import { runtimeBundleRecoveryAcknowledgementScript, runtimeBundleRecoveryScript } from '../runtime/install';

import { CommissioningSessionResponse } from './model';

import { DeliveryInput } from './model';

import { requireDeliveryCredentials } from './model';

import { auditCommissioning, CommissioningPrincipal } from './audit';

import { RuntimeReleaseChangedError } from './model';

import { CC100_DIGITAL_PROFILE_ID } from '../../shared/hardware-profile';

import { rm } from 'node:fs/promises';

import { WagoCommissioningSession } from './session.entity';

import { RuntimeDeliveryBundle } from './model';

import { WagoCommissioningPlatform } from './platform';

export abstract class WagoCommissioningRecovery extends WagoCommissioningPlatform {
  protected async withControllerLock<T>(id: number, operation: () => Promise<T>): Promise<T> {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    const key = session.hostKeyFingerprint || session.targetHost || session.hardwareId;
    const previous = this.controllerLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => (release = resolve));
    const queued = previous.then(() => current);
    this.controllerLocks.set(key, queued);
    await previous;
    const controller = new AbortController();
    const deadline = Date.now() + SSH_TIMEOUT_MS;
    let finished = false;
    const guard: CommissioningOperationGuard = {
      signal: controller.signal,
      deadline,
      assertOwned: async () => {
        if (finished || controller.signal.aborted || Date.now() >= deadline)
          throw new ConflictException('Controller operation has stopped. Retry the request.');
      },
    };
    try {
      let deviceOperations: WagoDeviceOperations | undefined;
      const owner = randomBytes(16).toString('hex');
      if (this.managedRuntime) {
        deviceOperations = new WagoDeviceOperations(this.context.getRepository(WagoDeviceOperation));
        if (!(await deviceOperations.acquire(key, owner, Date.now(), deadline + 60_000)))
          throw new ConflictException('Another controller operation is active. Retry after it finishes.');
      }
      const originalAssert = guard.assertOwned;
      guard.assertOwned = async () => {
        await originalAssert();
        await deviceOperations?.assertOwned(key, owner);
      };
      try {
        const enrolled = session.hardwareId
          ? await this.context.getRepository(WagoController).findOneBy({ hardwareId: session.hardwareId })
          : null;
        await this.managedRuntime?.assertNetworkSettled(enrolled?.id ?? null, session.hostKeyFingerprint ?? undefined);
        this.activeDeadlines.set(id, deadline);
        return await this.operationContext.run(guard, operation);
      } finally {
        this.activeDeadlines.delete(id);
        await deviceOperations?.release(key, owner);
      }
    } finally {
      finished = true;
      controller.abort();
      release();
      if (this.controllerLocks.get(key) === queued) this.controllerLocks.delete(key);
    }
  }

  protected async recoverWhileAudited(id: number, input: DeliveryInput): Promise<CommissioningSessionResponse> {
    const suppliedCredential = requireDeliveryCredentials(input);
    return this.withControllerLock(id, () =>
      this.withDeliveryLock(id, async () => {
        const session = await this.sessions.findOneBy({ id });
        if (!session) throw new NotFoundException('commissioning session not found');
        if (
          ![
            'delivery_failed',
            'awaiting_discovery',
            'awaiting_verification',
            'claim_interrupted',
            'recovery_revocation_pending',
            'revoked',
            'delivering',
            'awaiting_codesys_confirmation',
          ].includes(session.state)
        )
          throw new ConflictException('commissioning session cannot be recovered in its current state');
        const requiresNewSession =
          !session.pairingCode || ['claim_interrupted', 'awaiting_verification'].includes(session.state);
        if (!session.deliveryToken)
          throw new ConflictException('commissioning session has no runtime recovery ownership token');
        let restored = session.state === 'recovery_revocation_pending';
        try {
          const recoveryPassword = await this.managedRuntime?.commissioningRecoveryPassword?.(session);
          const credential = recoveryPassword ? { username: 'root', password: recoveryPassword } : suppliedCredential;
          // Cleanup must remain available even when the broker is unavailable.
          // Destructive commissioning never promises restoration of old workloads.
          if (!restored)
            await this.sudoRunScript(
              session.targetHost,
              session.hostKeyFingerprint,
              credential,
              runtimeBundleRecoveryScript('', session.deliveryToken),
              { timeoutMs: SSH_TIMEOUT_MS, maxOutputBytes: 4096, recoveryDiagnostic: true },
            );
          restored = true;
          if (requiresNewSession) session.pairingCode = null;
          session.state = 'recovery_revocation_pending';
          session.progressStep = 'Runtime installation cleaned up';
          session.progressDetail =
            'Failed runtime installation cleaned up. CODESYS remains disabled; previous workloads are not restored.';
          if (!session.pairingCode)
            session.progressDetail +=
              ' Remove the existing controller registration before creating a new commissioning session.';
          session.failureReason = null;
          await this.save(session, 'runtime_restored_revocation_pending');
          await this.sudoRunScript(
            session.targetHost,
            session.hostKeyFingerprint,
            credential,
            runtimeBundleRecoveryAcknowledgementScript('', session.deliveryToken),
            { timeoutMs: SSH_TIMEOUT_MS, maxOutputBytes: 4096, recoveryDiagnostic: true },
          );
          await this.cleanupControllerPreparation(session, credential);
          await this.revokeSessionEnrollment(session);
          session.state = session.pairingCode ? 'delivery_failed' : 'revoked';
          session.deliveryToken = null;
          return this.toResponse(await this.save(session, 'runtime_recovered'));
        } catch (error) {
          session.state = restored
            ? 'recovery_revocation_pending'
            : requiresNewSession
              ? 'claim_interrupted'
              : 'delivery_failed';
          session.progressStep = 'Recovery requires attention';
          session.progressDetail = restored
            ? 'Runtime cleanup completed. Retry recovery to finish preparation cleanup and broker credential revocation.'
            : 'Recovery could not be confirmed. An active lock is never removed; retry explicit recovery after the active operation ends.';
          session.failureReason =
            error instanceof WagoRecoveryError
              ? `${error.message}${restored ? ' Runtime cleanup completed; retry cleanup to finish controller preparation and credential revocation.' : ''}`
              : 'Installation cleanup or credential revocation failed; finish the retained recovery before retrying delivery.';
          return this.toResponse(await this.save(session, 'runtime_recovery_failed'));
        }
      }),
    );
  }

  async recover(
    id: number,
    input: DeliveryInput = {},
    principal: CommissioningPrincipal | null = null,
  ): Promise<CommissioningSessionResponse> {
    return auditCommissioning(
      this.context,
      principal,
      id,
      'recover',
      () => this.recoverWhileAudited(id, input),
      (result) => result.failureReason === null && ['delivery_failed', 'revoked'].includes(result.state),
    );
  }

  protected async assertCurrentRuntimeBundle(bundle: { digest: string; image?: string }): Promise<void> {
    if (!bundle.image || !this.artifacts) return;
    if ((await this.artifacts.current())?.digest !== bundle.digest) throw new RuntimeReleaseChangedError();
  }

  protected async acquireRuntimeBundle(session: WagoCommissioningSession): Promise<RuntimeDeliveryBundle> {
    await this.requireRuntimeArtifact();
    if (!this.artifacts) throw new ConflictException('Bundled CC100 runtime is unavailable.');
    const acquired = await this.artifacts.acquire();
    const bundle = {
      ...acquired,
      hardwareProfile: 'manifest' in acquired ? acquired.manifest.hardware.profile : CC100_DIGITAL_PROFILE_ID,
    };
    try {
      if (session.runtimeArtifactDigest !== bundle.digest) {
        session.runtimeArtifactDigest = bundle.digest;
        await this.save(session, 'runtime_release_resolved');
      }
      return bundle;
    } catch (error) {
      await rm(bundle.directory, { recursive: true, force: true });
      throw error;
    }
  }

  protected async requireRuntimeArtifact(): Promise<void> {
    if (!(await this.artifacts?.has()))
      throw new ConflictException('Build and install the bundled CC100 runtime before installation.');
  }

  protected async loadDeliverableSession(id: number): Promise<WagoCommissioningSession> {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    if (
      !['awaiting_delivery', 'delivering', 'awaiting_codesys_confirmation', 'delivery_failed'].includes(session.state)
    )
      throw new ConflictException('commissioning session cannot be delivered in its current state');
    return session;
  }

  async deliver(
    id: number,
    input: DeliveryInput = {},
    principal: CommissioningPrincipal | null = null,
  ): Promise<CommissioningSessionResponse> {
    return auditCommissioning(
      this.context,
      principal,
      id,
      'install',
      () =>
        this.withControllerLock(id, () =>
          this.withDeliveryLock(id, () => this.deliverWhileLocked(id, input, principal)),
        ),
      (result) => result.state === 'awaiting_discovery',
    );
  }
}
