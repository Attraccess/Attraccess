import { ConflictException } from '@nestjs/common';

import { type PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';

import { WagoCommissioningSession } from '../../commissioning/sessions/session.entity';

import { WagoController } from '../../controllers/entity';

import { commissioningVerification } from '../../commissioning/sessions/verification';

import { ManagementSetupReason, LiveHeartbeat } from './contracts';

import { RuntimeUpdateError, runtimeTargetImageId } from '../update/coordinator';

import { BuildRuntimeArtifact } from '../artifacts/build';

import { WagoManagedRuntimeAccess } from './access';

export abstract class WagoManagedRuntimeReconciliation extends WagoManagedRuntimeAccess {
  protected async securityAudit(
    id: number,
    action: 'root_recovery' | 'security_apply' | 'security_recover',
    principal: PluginAuditPrincipal,
    operationId: string,
    outcome: 'attempted' | 'succeeded' | 'failed',
  ) {
    const receipt = await this.context.audit.record({
      action: `wago.commissioning.${action}`,
      operationId,
      principal,
      outcome,
      subject: { type: 'wago.commissioning', id },
      details: {},
    });
    if (receipt.status !== 'recorded')
      throw new ConflictException('Durable audit is required for managed SSH recovery and transitions');
  }

  protected async finishSession(id: number) {
    await this.sessions.update(id, {
      deliveryToken: null,
      dockerProvisionToken: null,
      dockerProvisionState: null,
      state: 'completed',
      progressStep: 'Controller enrolled',
      progressDetail: 'Permanent runtime verified; encrypted managed SSH credentials retained for automatic updates.',
      failureReason: null,
    });
  }

  protected async enrolmentWaitReason(
    controller: WagoController,
    session: WagoCommissioningSession | null,
  ): Promise<ManagementSetupReason | null> {
    if (
      !controller.mqttServerId ||
      !session ||
      !['awaiting_verification', 'completed'].includes(session.state) ||
      session.hardwareId !== controller.hardwareId ||
      session.mqttServerId !== controller.mqttServerId
    )
      return 'session';
    if (!this.rootProbe) return 'server_setup';
    const proof = this.heartbeats.get(controller.id);
    if (!proof || Date.now() - proof.receivedAt > 90_000) return 'connection';
    const state = this.readiness.observe(
      controller.mqttServerId,
      controller.hardwareId,
      (await this.wago.getSettings()).operationalPrefix,
    );
    if (!state || state.streamId !== proof.streamId || Date.now() - state.timestamp > 90_000) return 'runtime_state';
    const verification = await commissioningVerification(this.context, session, state);
    if (!verification.permanentConnection) return 'connection';
    if (!verification.enrollmentRevoked) return 'enrollment_credentials';
    if (!verification.configurationApplied) return 'configuration';
    if (!state.ready || verification.hardwareReadiness !== 'ready') return 'readiness';
    return null;
  }

  protected async scan() {
    // Stable pages and fixed-size batches; no unbounded work queue or controller fanout.
    for (let skip = 0; !this.destroyed; skip += 50) {
      const controllers = await this.controllers.find({
        where: { trustState: 'claimed' },
        order: { id: 'ASC' },
        skip,
        take: 50,
      });
      for (let index = 0; index < controllers.length && !this.destroyed; index += 2)
        await Promise.all(
          controllers.slice(index, index + 2).map(async (controller) => {
            try {
              await this.assertNetworkSettled(controller.id);
              if (this.heartbeats.has(controller.id)) await this.refreshRuntimePolicy(controller.id);
              if (!(await this.completeEnrolment(controller))) return;
              this.verifyingControllers.add(controller.id);
              await this.coordinator.reconcile(controller.id, false, this.heartbeats.get(controller.id)?.imageId);
              this.reconciliationFailures.delete(controller.id);
            } catch (error) {
              this.reconciliationFailures.set(
                controller.id,
                error instanceof RuntimeUpdateError ? error.failure : 'interrupted',
              );
              this.context.logger.warn(`CC100 ${controller.id} managed reconciliation is deferred.`);
            } finally {
              this.verifyingControllers.delete(controller.id);
            }
          }),
        );
      if (controllers.length < 50) break;
    }
  }

  protected async reconcileConnection(id: number): Promise<void> {
    await this.assertNetworkSettled(id);
    const heartbeat = await this.refreshRuntimePolicy(id);
    if (!heartbeat) return;
    const controller = await this.controllers.findOneBy({ id, trustState: 'claimed' });
    if (controller && (await this.completeEnrolment(controller)))
      await this.coordinator.reconcile(id, true, heartbeat.imageId);
  }

  protected async refreshRuntimePolicy(id: number): Promise<LiveHeartbeat | undefined> {
    await this.assertNetworkSettled(id);
    let desired: BuildRuntimeArtifact;
    try {
      desired = await this.desired();
    } catch {
      throw new RuntimeUpdateError('runtime_assets');
    }
    const heartbeat = this.heartbeats.get(id);
    if (!heartbeat || this.destroyed) return;
    const access = await this.access.findOne({ where: { controllerId: id }, order: { sessionId: 'DESC' } });
    // Verified enrollment needs a ready runtime before management can be hardened.
    // Confirm its running image during bootstrap; the server still blocks commands
    // until management is complete and the bundled image policy can be enforced.
    const enrolling = access?.state === 'verified' || access?.state === 'recovery_required';
    const controller = await this.controllers.findOneBy({ id, trustState: 'claimed' });
    await this.wago.setRuntimePolicy?.(
      id,
      enrolling
        ? heartbeat.imageId
        : runtimeTargetImageId(desired, {
            imageId: heartbeat.imageId,
            runtimeVersion: heartbeat.runtimeVersion ?? controller?.runtimeVersion,
          }),
      heartbeat.imageId,
      heartbeat.runtimePolicyToken,
    );
    if (enrolling) this.wago.blockRuntime?.(id);
    this.reconciliationFailures.delete(id);
    return heartbeat;
  }

  protected wake() {
    if (this.destroyed || this.scanning || !this.coordinator || Date.now() < this.nextScanAt) return;
    this.nextScanAt = Date.now() + 30_000;
    this.scanning = true;
    void this.scan()
      .catch(() => this.context.logger.warn('Managed CC100 reconciliation requires attention.'))
      .finally(() => {
        this.scanning = false;
      });
  }
}
