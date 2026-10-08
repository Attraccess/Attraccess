import { auditCommissioning, commissioningPrincipal, CommissioningPrincipal } from './audit';

import { ConflictException, NotFoundException } from '@nestjs/common';

import { WagoController } from '../controllers/entity';

import { type CommissioningOperationGuard } from '../runtime/operation-guard';

import { CommissioningSessionResponse } from './model';

import { WagoCommissioningRecovery } from './recovery';

export abstract class WagoCommissioningOwnership extends WagoCommissioningRecovery {
  async claimDiscovered(controller: {
    id: number;
    hardwareId: string;
    mqttServerId: number | null;
    enrollmentId: number | null;
  }): Promise<void> {
    if (!controller.mqttServerId || !controller.enrollmentId) return;
    const session = await this.sessions.findOneBy({
      hardwareId: controller.hardwareId,
      mqttServerId: controller.mqttServerId,
      enrollmentId: controller.enrollmentId,
    });
    if (!session) return;

    await this.withControllerLock(session.id, () =>
      this.withDeliveryLock(session.id, async () => {
        const current = await this.sessions.findOneBy({ id: session.id });
        if (
          !current ||
          current.state !== 'awaiting_discovery' ||
          current.hardwareId !== controller.hardwareId ||
          current.mqttServerId !== controller.mqttServerId ||
          current.enrollmentId !== controller.enrollmentId ||
          !current.controllerName ||
          !current.pairingCode
        )
          return;

        let pairingCode: string;
        try {
          pairingCode = this.decryptVerifier(current);
        } catch {
          await this.invalidateVerifier(current);
          return;
        }
        current.state = 'awaiting_claim';
        current.failureReason = null;
        current.progressPercent = 100;
        current.progressStep = 'Claiming controller';
        current.progressDetail = 'Applying permanent credentials and the reserved controller name.';
        await this.save(current, 'automatic_claim_started');
        try {
          let principal: CommissioningPrincipal | null = null;
          try {
            const saved = JSON.parse(current.initiatingPrincipal ?? 'null');
            if (saved)
              principal = commissioningPrincipal({
                user: {
                  id: saved.userId,
                  authenticationMethod: saved.authenticationMethod,
                  apiTokenId: saved.apiTokenId,
                },
              } as never);
          } catch {
            /* Legacy sessions never invent an initiating actor. */
          }
          await this.operationContext.getStore()?.assertOwned();
          await this.managedRuntime?.bind(current.id, controller.id);
          await auditCommissioning(this.context, principal, controller.id, 'claim', () =>
            this.wago.claim(
              controller.id,
              current.controllerName,
              pairingCode,
              current.mqttServerId,
              this.operationContext.getStore()?.assertOwned,
            ),
          );
          current.state = 'awaiting_verification';
          current.pairingCode = null;
          current.failureReason = null;
          current.progressStep = 'Verifying commissioned controller';
          current.progressDetail =
            'Claim sent. Permanent connection, credential revocation, configuration and management hardening still require verification.';
          await this.save(current, 'automatic_claim_completed');
        } catch {
          current.state = 'awaiting_discovery';
          current.failureReason = 'Automatic claim failed.';
          await this.save(current, 'automatic_claim_failed');
          return;
        }
        await this.retireSupersededSessions(current.hardwareId, current.id).catch(() =>
          this.context.logger?.warn('Could not retire superseded WAGO commissioning sessions.'),
        );
      }),
    );
  }

  /** The HTTP audit wrapper belongs inside remove(), so removal is audited once by ATT-983. */
  async removeControllerSafely(
    id: number,
    remove: (assertOwned: () => Promise<void>) => Promise<string>,
  ): Promise<void> {
    const controller = await this.context.getRepository(WagoController).findOneBy({ id });
    if (!controller) throw new NotFoundException('controller not found');
    const sessions = await this.sessions.find({ where: { hardwareId: controller.hardwareId }, order: { id: 'DESC' } });
    if (!sessions.length) {
      await remove(async () => undefined);
      return;
    }
    await this.withControllerLock(sessions[0].id, async () => {
      const guard = this.operationContext.getStore();
      if (!guard) throw new ConflictException('Controller operation ownership is unavailable.');
      const assertOwned = guard.assertOwned;
      await assertOwned();
      await this.managedRuntime?.assertRemovable(id);
      const hardwareId = await remove(assertOwned);
      await this.managedRuntime?.retire(id);
      for (const candidate of await this.sessions.find({ where: { hardwareId } })) {
        await this.withDeliveryLock(candidate.id, async () => {
          const session = await this.sessions.findOneBy({ id: candidate.id });
          if (!session) return;
          await this.revokeSessionEnrollment(session);
          if (session.managementControllerId) {
            const security = await this.management.status(session.managementControllerId);
            if (!security || (!security.recoveryRequired && !['key_enrolled', 'hardened'].includes(security.state)))
              session.managementControllerId = null;
          }
          if (
            session.deliveryToken ||
            session.dockerProvisionToken ||
            session.managementControllerId ||
            (await this.managedRuntime?.hasAccess(session.id))
          ) {
            session.state = 'revoked';
            session.pairingCode = null;
            session.progressStep = 'Controller registration removed';
            session.progressDetail =
              'Credentials revoked. Retained runtime, Docker and management recovery remain available; removal did not uninstall the controller runtime.';
            await this.save(session, 'controller_removed_recovery_retained');
          } else {
            await assertOwned();
            await this.sessions.delete(session.id);
          }
        });
      }
    });
  }

  async operateControllerSafely<T>(
    id: number,
    operation: (assertOwned: () => Promise<void>, guard: CommissioningOperationGuard) => Promise<T>,
    requireCommissioningSession = false,
  ): Promise<T> {
    const controller = await this.context.getRepository(WagoController).findOneBy({ id });
    if (!controller) throw new NotFoundException('controller not found');
    const sessions = await this.sessions.find({ where: { hardwareId: controller.hardwareId }, order: { id: 'DESC' } });
    if (!sessions.length) {
      if (requireCommissioningSession)
        throw new ConflictException('A commissioning session must remain pinned while rotating credentials.');
      const controller = new AbortController();
      const guard = {
        assertOwned: async () => {
          if (controller.signal.aborted) throw new ConflictException('Controller operation ended');
        },
        signal: controller.signal,
        deadline: Date.now() + 60_000,
      };
      try {
        return await operation(guard.assertOwned, guard);
      } finally {
        controller.abort();
      }
    }
    return this.withControllerLock(sessions[0].id, async () => {
      const guard = this.operationContext.getStore();
      if (!guard) throw new ConflictException('Controller operation ownership is unavailable.');
      await guard.assertOwned();
      return operation(guard.assertOwned, guard);
    });
  }

  async removeByHardwareId(hardwareId: string): Promise<void> {
    const sessions = await this.sessions.find({ where: { hardwareId } });
    await Promise.all(sessions.map((session) => this.remove(session.id)));
  }

  async remove(id: number): Promise<void> {
    await this.withControllerLock(id, () =>
      this.withDeliveryLock(id, async () => {
        const session = await this.sessions.findOneBy({ id });
        if (!session) throw new NotFoundException('commissioning session not found');
        if (session.deliveryToken)
          throw new ConflictException('Clean up the retained runtime installation before deleting this session.');
        if (session.dockerProvisionToken)
          throw new ConflictException('Clean up the retained controller preparation before deleting this session.');
        if (await this.managedRuntime?.hasAccess(id))
          throw new ConflictException(
            'Retain this session for audited managed SSH recovery. Re-enrolment creates a fresh management identity.',
          );
        if (session.managementControllerId) {
          const security = await this.management.status(session.managementControllerId);
          if (security && (security.recoveryRequired || ['key_enrolled', 'hardened'].includes(security.state)))
            throw new ConflictException('Recover the saved management access before deleting this session.');
        }
        if (session.enrollmentId !== null) {
          try {
            await this.wago.revokeEnrollmentById(session.enrollmentId, this.operationContext.getStore()?.assertOwned);
            await this.wago.deleteEnrollmentById(session.enrollmentId, this.operationContext.getStore()?.assertOwned);
          } catch {
            throw new ConflictException('Commissioning enrollment removal failed.');
          }
        }
        await this.operationContext.getStore()?.assertOwned();
        await this.sessions.delete(id);
      }),
    );
  }

  async revoke(id: number): Promise<CommissioningSessionResponse> {
    return this.withControllerLock(id, () =>
      this.withDeliveryLock(id, async () => {
        const session = await this.sessions.findOneBy({ id });
        if (!session) throw new NotFoundException('commissioning session not found');
        await this.revokeSessionEnrollment(session);
        session.state = 'revoked';
        session.pairingCode = null;
        session.failureReason = null;
        return this.toResponse(await this.save(session, 'revoked'));
      }),
    );
  }
}
