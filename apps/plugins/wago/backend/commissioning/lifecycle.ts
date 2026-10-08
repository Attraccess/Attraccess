import { WagoCommissioningSession } from './session.entity';

import { CommissioningSessionResponse } from './model';

import { ConflictException } from '@nestjs/common';

import { WagoController } from '../controllers/entity';

import { VERIFIER_PREFIX } from './model';

import { commissioningCheckpoints, type CommissioningCheckpoint } from './progress';

import { WagoCommissioningTransport } from './transport';

export abstract class WagoCommissioningProgress extends WagoCommissioningTransport {
  protected async withDeliveryLock<T>(id: number, operation: () => Promise<T>): Promise<T> {
    const previous = this.deliveryLocks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => (release = resolve));
    const queued = previous.then(() => current);
    this.deliveryLocks.set(id, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.deliveryLocks.get(id) === queued) this.deliveryLocks.delete(id);
    }
  }

  protected async toResponse(session: WagoCommissioningSession): Promise<CommissioningSessionResponse> {
    const {
      pairingCode: _pairingCode,
      deliveryToken: _deliveryToken,
      initiatingPrincipal: _principal,
      dockerProvisionToken: _dockerToken,
      ...response
    } = session;
    void _pairingCode;
    void _deliveryToken;
    void _principal;
    void _dockerToken;
    const deadline = this.activeDeadlines.get(session.id);
    return {
      ...response,
      operationDeadlineAt: deadline === undefined ? null : new Date(deadline).toISOString(),
      ...(_deliveryToken ? { runtimeRecoveryAvailable: true } : {}),
      ...((await this.managedRuntime?.hasAccess(session.id)) ? { managedAccessAvailable: true } : {}),
    };
  }

  protected async retireSupersededSessions(hardwareId: string, completedSessionId: number): Promise<void> {
    for (let skip = 0; ; skip += 100) {
      const sessions = await this.sessions.find({ where: { hardwareId }, order: { id: 'ASC' }, take: 100, skip });
      await Promise.all(
        sessions
          .filter(
            (session) =>
              session.id !== completedSessionId && session.state !== 'completed' && session.state !== 'revoked',
          )
          .map((session) =>
            this.withDeliveryLock(session.id, async () => {
              const current = await this.sessions.findOneBy({ id: session.id });
              if (!current || current.state === 'completed' || current.state === 'revoked') return;
              await this.revokeSessionEnrollment(current);
              current.state = 'revoked';
              current.pairingCode = null;
              current.failureReason = null;
              current.progressStep = 'Superseded by completed commissioning';
              current.progressDetail = 'A newer commissioning session claimed this controller.';
              await this.save(current, 'superseded_by_completed_session');
            }),
          ),
      );
      if (sessions.length < 100) break;
    }
  }

  protected async reconcileCompletedSessions(): Promise<void> {
    for (let skip = 0; ; skip += 100) {
      const page = await this.sessions.find({ where: { state: 'completed' }, order: { id: 'ASC' }, take: 100, skip });
      for (const session of page) {
        if (session.state === 'completed')
          await this.withControllerLock(session.id, () =>
            this.retireSupersededSessions(session.hardwareId, session.id),
          );
      }
      if (page.length < 100) break;
    }
  }

  protected async recoverSessions(): Promise<void> {
    let recoveryFailed = false;
    // Page the entire stable ID ordering: changing states must not skip rows.
    for (let skip = 0; ; skip += 100) {
      const page = await this.sessions.find({ order: { id: 'ASC' }, take: 100, skip });
      for (const candidate of page) {
        // An enrolled session needs no startup mutation. A background managed
        // check can legitimately hold its lease; do not disable discovery for it.
        if (
          ['completed', 'awaiting_verification', 'claim_interrupted'].includes(candidate.state) &&
          !candidate.pairingCode &&
          !(candidate.dockerProvisionToken && ['starting', 'recovering'].includes(candidate.dockerProvisionState ?? ''))
        )
          continue;
        try {
          await this.withControllerLock(candidate.id, async () => {
            const session = await this.sessions.findOneBy({ id: candidate.id });
            if (!session || session.state === 'recovery_revocation_pending') return;
            if (
              session.dockerProvisionToken &&
              ['starting', 'recovering'].includes(session.dockerProvisionState ?? '')
            ) {
              session.dockerProvisionState = 'recovery_required';
              session.failureReason =
                'Controller preparation was interrupted. Clean up the retained attempt before retrying.';
              await this.save(session, 'controller_preparation_interrupted');
            }
            if (
              ['completed', 'awaiting_verification', 'claim_interrupted'].includes(session.state) &&
              !session.pairingCode
            )
              return;
            if (session.state === 'revoked' && !session.pairingCode) {
              await this.revokeSessionEnrollment(session);
              return;
            }
            try {
              this.decryptVerifier(session);
            } catch {
              await this.invalidateVerifier(session);
              return;
            }
            if (session.state === 'awaiting_claim') {
              const controller =
                session.enrollmentId === null
                  ? null
                  : await this.context.getRepository(WagoController).findOneBy({
                      hardwareId: session.hardwareId,
                      mqttServerId: session.mqttServerId,
                      enrollmentId: session.enrollmentId,
                    });
              // A persisted claim may already have reached the device. Do not reinstall
              // or rotate its permanent identity merely because the API restarted.
              session.state = controller?.trustState === 'claimed' ? 'claim_interrupted' : 'awaiting_discovery';
              session.progressStep = 'Claim interrupted; recovery required';
              session.progressDetail =
                'Permanent credentials may or may not have reached the runtime. Do not retry installation; recover the saved runtime and remove its controller registration before creating a new session.';
              await this.save(session, 'claim_reconciled_after_restart');
            }
            if (session.state === 'delivering') {
              session.state = 'delivery_failed';
              session.progressStep = 'Delivery interrupted';
              session.progressDetail =
                'Clean up the retained preparation or runtime installation before retrying with explicit SSH credentials.';
              session.failureReason = 'Commissioning was interrupted.';
              await this.save(session, 'delivery_interrupted');
              await this.revokeSessionEnrollment(session);
            }
          });
        } catch {
          // Still invalidate later plaintext sessions when one broker is unavailable.
          recoveryFailed = true;
        }
      }
      if (page.length < 100) break;
    }
    if (recoveryFailed) throw new ConflictException('Commissioning recovery requires credential revocation.');
  }

  protected async invalidateVerifier(session: WagoCommissioningSession): Promise<void> {
    // Persist the claim block before calling a broker which may be unavailable.
    session.state = 'revoked';
    session.pairingCode = null;
    session.progressStep = 'Commissioning session revoked';
    session.progressDetail = 'The saved verifier is unavailable. Create a new commissioning session.';
    session.failureReason = 'Commissioning verifier is unavailable; credential revocation requires attention.';
    await this.save(session, 'verifier_invalidated');
    await this.revokeSessionEnrollment(session);
    session.failureReason = null;
    await this.save(session, 'invalid_verifier_revoked');
  }

  protected async revokeSessionEnrollment(session: WagoCommissioningSession): Promise<void> {
    if (session.enrollmentId == null) return;
    await this.operationContext.getStore()?.assertOwned();
    try {
      await this.wago.revokeEnrollmentById(session.enrollmentId, this.operationContext.getStore()?.assertOwned);
    } catch {
      throw new ConflictException('Commissioning credential revocation requires attention.');
    }
    session.enrollmentId = null;
    session.enrollmentExpiresAt = null;
    await this.save(session, 'enrollment_revoked');
  }

  protected decryptVerifier(session: WagoCommissioningSession): string {
    try {
      if (!session.pairingCode?.startsWith(VERIFIER_PREFIX)) throw new Error();
      const plaintext = this.context.secrets.decrypt(session.pairingCode.slice(VERIFIER_PREFIX.length));
      if (!/^[A-Za-z0-9_-]{43}$/.test(plaintext)) throw new Error();
      return plaintext;
    } catch {
      throw new ConflictException('Commissioning verifier is unavailable; create a new session.');
    }
  }

  protected encryptVerifier(plaintext: string): string {
    try {
      return VERIFIER_PREFIX + this.context.secrets.encrypt(plaintext);
    } catch {
      throw new ConflictException('Commissioning verifier encryption failed.');
    }
  }

  protected reportPreparationProgress(session: WagoCommissioningSession, checkpoint: CommissioningCheckpoint): void {
    const [percent, step, detail] = commissioningCheckpoints[checkpoint];
    if (session.progressStep === step) return;
    const updatedAt = new Date().toISOString();
    session.progressPercent = percent;
    session.progressStep = step;
    session.progressDetail = detail;
    const audit = JSON.parse(session.auditLog) as Array<{ at: string; event: string }>;
    audit.push({ at: updatedAt, event: `progress: ${step}` });
    session.auditLog = JSON.stringify(audit.slice(-50));
    session.updatedAt = updatedAt;
    const update = {
      progressPercent: percent,
      progressStep: step,
      progressDetail: detail,
      updatedAt,
      auditLog: session.auditLog,
    };
    const write = (this.transferWrites.get(session.id) ?? Promise.resolve())
      .then(async () => {
        await this.operationContext.getStore()?.assertOwned();
        await this.sessions.update(session.id, update);
      })
      .catch(() => this.context.logger?.warn('Could not update WAGO controller preparation progress.'));
    this.transferWrites.set(session.id, write);
    void write.then(() => {
      if (this.transferWrites.get(session.id) === write) this.transferWrites.delete(session.id);
    });
  }

  protected reportTransferProgress(session: WagoCommissioningSession, percent: number): void {
    const progressPercent = 55 + Math.round((percent * 15) / 100);
    session.progressPercent = progressPercent;
    session.progressStep = 'Transferring runtime';
    session.progressDetail = `Uploading runtime bundle: ${percent}%.`;
    const update = {
      progressPercent,
      progressStep: session.progressStep,
      progressDetail: session.progressDetail,
      updatedAt: new Date().toISOString(),
    };
    const write = (this.transferWrites.get(session.id) ?? Promise.resolve())
      .then(async () => {
        await this.operationContext.getStore()?.assertOwned();
        await this.sessions.update(session.id, update);
      })
      .catch(() => this.context.logger?.warn('Could not update WAGO runtime transfer progress.'));
    this.transferWrites.set(session.id, write);
    void write.then(() => {
      if (this.transferWrites.get(session.id) === write) this.transferWrites.delete(session.id);
    });
  }

  protected async updateProgress(
    session: WagoCommissioningSession,
    percent: number,
    step: string,
    detail: string,
  ): Promise<void> {
    session.progressPercent = percent;
    session.progressStep = step;
    session.progressDetail = detail;
    await this.save(session, `progress: ${step}`);
  }

  protected async save(session: WagoCommissioningSession, event: string): Promise<WagoCommissioningSession> {
    await this.operationContext.getStore()?.assertOwned();
    const audit = JSON.parse(session.auditLog) as Array<{ at: string; event: string }>;
    audit.push({ at: new Date().toISOString(), event });
    session.auditLog = JSON.stringify(audit.slice(-50));
    session.updatedAt = new Date().toISOString();
    return this.sessions.save(session);
  }
}
