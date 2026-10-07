import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import { WagoController } from './wago-controller.entity';
import { WagoManagedEnrolmentFailure } from './wago-managed-enrolment-failure';
import { managedHostHelper } from './wago-managed-helper';
import { managedWatchdogScript } from './wago-managed-provision';
import { type ManagedSetupStage } from './wago-managed-setup-error';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoService } from './wago.service';

@Injectable()
export class WagoManagedRuntimeService
  extends WagoManagedEnrolmentFailure
  implements OnApplicationBootstrap, OnModuleDestroy
{
  constructor(
    @Inject(Symbol.for('attraccess.plugin.context')) context: PluginContext,
    @Inject(WagoService) wago: WagoService,
    @Inject(WagoRuntimeArtifactsService) artifacts: WagoRuntimeArtifactsService,
    @Inject(WagoCommissioningReadiness) readiness: WagoCommissioningReadiness,
  ) {
    super(context, wago, artifacts, readiness);
  }

  protected async completeEnrolment(controller: WagoController): Promise<boolean> {
    if (!controller.mqttServerId) return false;
    const bound = await this.access.findOne({ where: { controllerId: controller.id }, order: { sessionId: 'DESC' } });
    if (!bound) return false;
    const session = await this.sessions.findOneBy({ id: bound.sessionId });
    if (!session || !['awaiting_verification', 'completed'].includes(session.state)) return false;
    if (session.hardwareId !== controller.hardwareId || session.mqttServerId !== controller.mqttServerId) return false;
    let access = await this.loadSession(session.id);
    if (!access || ['retiring', 'retired', 'pending'].includes(access.state)) return false;
    try {
      if (this.credentials(access).hardwareId !== controller.hardwareId) throw new Error();
    } catch {
      await this.setActiveState(access.sessionId, 'recovery_required');
      return false;
    }
    if (access.state === 'managed') {
      if (session.deliveryToken || session.dockerProvisionToken || session.state !== 'completed')
        await this.finishSession(session.id);
      return true;
    }
    if (!this.rootProbe || (await this.enrolmentWaitReason(controller, session))) return false;
    const owner = randomBytes(16).toString('hex');
    if (!(await this.operations.acquire(access.fingerprint, owner, Date.now(), Date.now() + 22 * 60_000))) return false;
    const operation = new AbortController();
    // Key confirmation, acceptance and cutover can each wait 310s for a
    // supervisor gate. The rollback window starts only once SSH actually changes.
    let timer = setTimeout(() => operation.abort(), 18 * 60_000).unref();
    let stage: ManagedSetupStage = 'status';
    const operationId = randomUUID();
    let principal: PluginAuditPrincipal | null = null;
    let attempted = false;
    this.enrolmentProgress.set(controller.id, { state: 'running', reason: 'preparation' });
    try {
      await this.operations.assertOwned(access.fingerprint, owner);
      access = await this.loadSession(session.id);
      if (!access || ['retiring', 'retired', 'pending'].includes(access.state)) return false;
      const remoteStatus = await this.connection(access, `access-status ${access.token}`, operation.signal);
      if (remoteStatus === 'cutover\n' && access.state !== 'recovery_required') return false;
      if (!['open\n', 'committed\n', 'cutover\n'].includes(remoteStatus)) throw new Error('Unknown management receipt');
      const committed = remoteStatus === 'committed\n';
      if (committed) {
        clearTimeout(timer);
        timer = setTimeout(() => operation.abort(), 180_000).unref();
      }
      stage = 'audit';
      principal = JSON.parse(session.initiatingPrincipal ?? 'null') as PluginAuditPrincipal | null;
      if (!principal) throw new Error('Management audit initiator unavailable');
      await this.securityAudit(session.id, 'security_apply', principal, operationId, 'attempted');
      attempted = true;
      await this.sessions.update(session.id, { updatedAt: new Date().toISOString() });
      await this.access.update(access.sessionId, { controllerId: controller.id });
      if (remoteStatus === 'cutover\n') {
        // A previous attempt already failed. Request the same safe rollback as
        // the watchdog, without retiring the key or confirming an unknown policy.
        stage = 'rollback';
        clearTimeout(timer);
        timer = setTimeout(() => operation.abort(), 50_000).unref();
        await this.connection(access, `access-restore ${access.token}`, operation.signal);
        await this.securityAudit(session.id, 'security_apply', principal, operationId, 'failed');
        return false;
      }
      if (!committed) {
        stage = 'ownership';
        if (!session.deliveryToken || !session.dockerProvisionToken)
          throw new Error('Commissioning ownership unavailable');
        stage = 'proof';
        await this.prove(access, operation.signal);
        stage = 'recovery_login';
        if (!(await this.rootProbe(access.host, access.fingerprint, this.credentials(access).recoveryPassword)))
          throw new Error('Root recovery path is unverified');
        await this.setActiveState(access.sessionId, 'verified');
        stage = 'key_commit';
        await this.connection(access, `access-key-commit ${access.token}`, operation.signal);
        stage = 'proof';
        await this.prove(access, operation.signal);
        stage = 'acceptance';
        if (this.rootAcceptance) {
          // Older initial helpers reject a busy supervisor lock immediately and
          // cannot be replaced while their installation journals are outstanding.
          // Finish only these owned journals through the still-verified bootstrap
          // login; all runtime updates after cutover continue to use the scoped key.
          await this.rootAcceptance(
            access.host,
            access.fingerprint,
            this.credentials(access).recoveryPassword,
            session.deliveryToken,
            {
              assertOwned: () => this.operations.assertOwned(access.fingerprint, owner),
              signal: operation.signal,
              deadline: Date.now() + 12 * 60_000,
            },
            { token: access.token, helper: managedHostHelper(await this.desired()), watchdog: managedWatchdogScript() },
          );
        } else await this.connection(access, `commissioning-accept ${session.deliveryToken}`, operation.signal);
        stage = 'cutover';
        this.enrolmentProgress.set(controller.id, { state: 'running', reason: 'ssh_cutover' });
        await this.connection(access, `access-cutover ${access.token}`, operation.signal);
        clearTimeout(timer);
        timer = setTimeout(() => operation.abort(), 180_000).unref();
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      stage = 'policy';
      await this.prove(access, operation.signal);
      if ((await this.connection(access, `access-policy ${access.token}`, operation.signal)) !== 'OK\n')
        throw new Error('Managed SSH policy is unverified');
      stage = 'root_login';
      if (await this.rootProbe(access.host, access.fingerprint, this.credentials(access).recoveryPassword))
        throw new Error('Root SSH remains enabled');
      await this.prove(access, operation.signal);
      if (!committed) {
        this.enrolmentProgress.set(controller.id, { state: 'running', reason: 'reboot' });
        stage = 'boot';
        const boot = await this.connection(access, `access-boot ${access.token}`, operation.signal);
        if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\n$/.test(boot))
          throw new Error('Controller boot identity unavailable');
        stage = 'reboot';
        await this.connection(access, `access-reboot ${access.token}`, operation.signal).catch(() => undefined);
        let rebootVerified = false;
        for (let attempt = 0; attempt < 60; attempt++) {
          operation.signal.throwIfAborted();
          await new Promise((resolve) => setTimeout(resolve, 1000));
          try {
            const next = await this.connection(access, `access-boot ${access.token}`, operation.signal);
            if (next !== boot && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\n$/.test(next)) {
              await this.prove(access, operation.signal);
              if ((await this.connection(access, `access-policy ${access.token}`, operation.signal)) !== 'OK\n')
                throw new Error('Post-reboot SSH policy unverified');
              if (await this.rootProbe(access.host, access.fingerprint, this.credentials(access).recoveryPassword))
                throw new Error('Root SSH enabled after reboot');
              await this.prove(access, operation.signal);
              rebootVerified = true;
              break;
            }
          } catch {
            // Reboot disconnects are expected. The deadline and host watchdog
            // remain independent; no ambiguous result can commit the policy.
          }
        }
        if (!rebootVerified) throw new Error('Managed reboot verification failed');
      }
      await this.operations.assertOwned(access.fingerprint, owner);
      stage = 'confirmation';
      this.enrolmentProgress.set(controller.id, { state: 'running', reason: 'confirmation' });
      if (!committed) await this.connection(access, `access-commit ${access.token}`, operation.signal);
      await this.setActiveState(access.sessionId, 'managed');
      await this.finishSession(session.id);
      await this.securityAudit(session.id, 'security_apply', principal, operationId, 'succeeded');
      return true;
    } catch (error) {
      return await this.failEnrolment(session, error, stage, attempted, principal, operationId, operation);
    } finally {
      this.enrolmentProgress.delete(controller.id);
      clearTimeout(timer);
      operation.abort();
      await this.operations.release(bound.fingerprint, owner);
    }
  }
}
