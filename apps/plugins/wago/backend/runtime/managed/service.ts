import { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';

import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

import { randomBytes, randomUUID, createHash } from 'node:crypto';

import { WagoCommissioningReadiness } from '../../commissioning/readiness/readiness';

import { WagoController } from '../../controllers/entity';

import { WagoManagedAccess } from './access.entity';

import { managedHostHelper } from './provisioning/helper';

import { managedWatchdogScript } from './provisioning/provision';

import { type ManagedSetupStage, managedSetupFailure } from './setup-error';

import { WagoRuntimeArtifactsService } from '../artifacts/catalog';

import { WagoService } from '../../controllers/service';

import { WagoCommissioningSession } from '../../commissioning/sessions/session.entity';

import {
  RuntimeUpdateError,
  type RuntimeUpdateRecord,
  type ManagedRuntimeUpdateHost,
  type RuntimeUpdateStore,
} from '../update/coordinator';

import { MANAGED_HELPER_PROTOCOL, signInstaller } from './provisioning/installer';

import { WagoManagedRuntimeReconciliation } from './reconciliation';

/** Mutable state of one leased enrolment attempt, read by failure handling and cleanup. */
export interface EnrolmentAttempt {
  readonly controller: WagoController;
  readonly session: WagoCommissioningSession;
  readonly owner: string;
  readonly operation: AbortController;
  readonly operationId: string;
  timer: ReturnType<typeof setTimeout>;
  stage: ManagedSetupStage;
  principal: PluginAuditPrincipal | null;
  attempted: boolean;
}

@Injectable()
export class WagoManagedRuntimeService
  extends WagoManagedRuntimeReconciliation
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
    const candidate = await this.enrolmentCandidate(controller);
    if (!candidate) return false;
    const { bound, session, access } = candidate;
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
    const attempt: EnrolmentAttempt = {
      controller,
      session,
      owner,
      operation,
      // Key confirmation, acceptance and cutover can each wait 310s for a
      // supervisor gate. The rollback window starts only once SSH actually changes.
      timer: setTimeout(() => operation.abort(), 18 * 60_000).unref(),
      stage: 'status',
      operationId: randomUUID(),
      principal: null,
      attempted: false,
    };
    this.enrolmentProgress.set(controller.id, { state: 'running', reason: 'preparation' });
    try {
      return await this.runEnrolment(attempt, access.fingerprint);
    } catch (error) {
      return await this.failEnrolment(
        session,
        error,
        attempt.stage,
        attempt.attempted,
        attempt.principal,
        attempt.operationId,
        operation,
      );
    } finally {
      this.enrolmentProgress.delete(controller.id);
      clearTimeout(attempt.timer);
      operation.abort();
      await this.operations.release(bound.fingerprint, owner);
    }
  }

  /** Bound, unretired access whose commissioning session still matches this controller. */
  protected async enrolmentCandidate(controller: WagoController) {
    if (!controller.mqttServerId) return null;
    const bound = await this.access.findOne({ where: { controllerId: controller.id }, order: { sessionId: 'DESC' } });
    if (!bound) return null;
    const session = await this.sessions.findOneBy({ id: bound.sessionId });
    if (!session || !['awaiting_verification', 'completed'].includes(session.state)) return null;
    if (session.hardwareId !== controller.hardwareId || session.mqttServerId !== controller.mqttServerId) return null;
    const access = await this.loadSession(session.id);
    if (!access || ['retiring', 'retired', 'pending'].includes(access.state)) return null;
    return { bound, session, access };
  }

  /** Probes the pinned bootstrap root login with the encrypted recovery password. completeEnrolment
   * only starts an attempt once a probe is registered; probes are never unregistered. */
  protected async rootLoginAccepted(access: WagoManagedAccess): Promise<boolean> {
    const probe = this.rootProbe;
    if (!probe) throw new Error('Root recovery probe unavailable');
    return probe(access.host, access.fingerprint, this.credentials(access).recoveryPassword);
  }

  /** Replaces the attempt's operation deadline; called whenever a new bounded phase starts. */
  protected restartEnrolmentTimer(attempt: EnrolmentAttempt, ms: number): void {
    clearTimeout(attempt.timer);
    attempt.timer = setTimeout(() => attempt.operation.abort(), ms).unref();
  }

  /** Runs the leased enrolment attempt; `attempt` records the stage and audit state for failure handling. */
  protected async runEnrolment(attempt: EnrolmentAttempt, fingerprint: string): Promise<boolean> {
    const { controller, session, owner, operation, operationId } = attempt;
    await this.operations.assertOwned(fingerprint, owner);
    const access = await this.loadSession(session.id);
    if (!access || ['retiring', 'retired', 'pending'].includes(access.state)) return false;
    const remoteStatus = await this.connection(access, `access-status ${access.token}`, operation.signal);
    if (remoteStatus === 'cutover\n' && access.state !== 'recovery_required') return false;
    if (!['open\n', 'committed\n', 'cutover\n'].includes(remoteStatus)) throw new Error('Unknown management receipt');
    const committed = remoteStatus === 'committed\n';
    if (committed) this.restartEnrolmentTimer(attempt, 180_000);
    attempt.stage = 'audit';
    const principal = JSON.parse(session.initiatingPrincipal ?? 'null') as PluginAuditPrincipal | null;
    attempt.principal = principal;
    if (!principal) throw new Error('Management audit initiator unavailable');
    await this.securityAudit(session.id, 'security_apply', principal, operationId, 'attempted');
    attempt.attempted = true;
    await this.sessions.update(session.id, { updatedAt: new Date().toISOString() });
    await this.access.update(access.sessionId, { controllerId: controller.id });
    if (remoteStatus === 'cutover\n') {
      // A previous attempt already failed. Request the same safe rollback as
      // the watchdog, without retiring the key or confirming an unknown policy.
      attempt.stage = 'rollback';
      this.restartEnrolmentTimer(attempt, 50_000);
      await this.connection(access, `access-restore ${access.token}`, operation.signal);
      await this.securityAudit(session.id, 'security_apply', principal, operationId, 'failed');
      return false;
    }
    if (!committed) await this.cutOverEnrolment(attempt, access);
    attempt.stage = 'policy';
    await this.prove(access, operation.signal);
    if ((await this.connection(access, `access-policy ${access.token}`, operation.signal)) !== 'OK\n')
      throw new Error('Managed SSH policy is unverified');
    attempt.stage = 'root_login';
    if (await this.rootLoginAccepted(access)) throw new Error('Root SSH remains enabled');
    await this.prove(access, operation.signal);
    if (!committed) await this.verifyEnrolmentReboot(attempt, access);
    await this.operations.assertOwned(access.fingerprint, owner);
    attempt.stage = 'confirmation';
    this.enrolmentProgress.set(controller.id, { state: 'running', reason: 'confirmation' });
    if (!committed) await this.connection(access, `access-commit ${access.token}`, operation.signal);
    await this.setActiveState(access.sessionId, 'managed');
    await this.finishSession(session.id);
    await this.securityAudit(session.id, 'security_apply', principal, operationId, 'succeeded');
    return true;
  }

  /** First attempt: prove recovery, commit the key, accept commissioning and switch SSH policy. */
  protected async cutOverEnrolment(attempt: EnrolmentAttempt, access: WagoManagedAccess): Promise<void> {
    const { controller, session, owner, operation } = attempt;
    attempt.stage = 'ownership';
    if (!session.deliveryToken || !session.dockerProvisionToken) throw new Error('Commissioning ownership unavailable');
    attempt.stage = 'proof';
    await this.prove(access, operation.signal);
    attempt.stage = 'recovery_login';
    if (!(await this.rootLoginAccepted(access))) throw new Error('Root recovery path is unverified');
    await this.setActiveState(access.sessionId, 'verified');
    attempt.stage = 'key_commit';
    await this.connection(access, `access-key-commit ${access.token}`, operation.signal);
    attempt.stage = 'proof';
    await this.prove(access, operation.signal);
    attempt.stage = 'acceptance';
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
    attempt.stage = 'cutover';
    this.enrolmentProgress.set(controller.id, { state: 'running', reason: 'ssh_cutover' });
    await this.connection(access, `access-cutover ${access.token}`, operation.signal);
    this.restartEnrolmentTimer(attempt, 180_000);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  /** First attempt: reboot and require the new boot to keep the hardened policy. */
  protected async verifyEnrolmentReboot(attempt: EnrolmentAttempt, access: WagoManagedAccess): Promise<void> {
    const { controller, operation } = attempt;
    this.enrolmentProgress.set(controller.id, { state: 'running', reason: 'reboot' });
    attempt.stage = 'boot';
    const boot = await this.connection(access, `access-boot ${access.token}`, operation.signal);
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\n$/.test(boot))
      throw new Error('Controller boot identity unavailable');
    attempt.stage = 'reboot';
    await this.connection(access, `access-reboot ${access.token}`, operation.signal).catch(() => undefined);
    let rebootVerified = false;
    for (let poll = 0; poll < 60; poll++) {
      operation.signal.throwIfAborted();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const next = await this.connection(access, `access-boot ${access.token}`, operation.signal);
        if (next !== boot && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\n$/.test(next)) {
          await this.prove(access, operation.signal);
          if ((await this.connection(access, `access-policy ${access.token}`, operation.signal)) !== 'OK\n')
            throw new Error('Post-reboot SSH policy unverified');
          if (await this.rootLoginAccepted(access)) throw new Error('Root SSH enabled after reboot');
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

  protected async failEnrolment(
    session: WagoCommissioningSession,
    error: unknown,
    stage: ManagedSetupStage,
    attempted: boolean,
    principal: PluginAuditPrincipal | null,
    operationId: string,
    operation: AbortController,
  ): Promise<boolean> {
    if (attempted && principal)
      await this.securityAudit(session.id, 'security_apply', principal, operationId, 'failed').catch(() => undefined);
    await this.access
      .createQueryBuilder()
      .update()
      .set({ state: 'recovery_required' })
      .where('session_id = :sessionId AND state NOT IN (:...retired)', {
        sessionId: session.id,
        retired: ['retiring', 'retired'],
      })
      .execute();
    // Keep the last audited attempt's diagnosis through transient offline
    // probes while the controller reboots or its rollback is still running.
    const transientOfflineProbe =
      stage === 'status' && error instanceof RuntimeUpdateError && error.failure === 'offline';
    if (attempted || !session.failureReason || !transientOfflineProbe)
      await this.sessions.update(session.id, {
        failureReason: managedSetupFailure(stage, error, operation.signal.aborted),
        updatedAt: new Date().toISOString(),
      });
    return false;
  }

  public async onModuleDestroy() {
    this.destroyed = true;
    if (this.timer) clearInterval(this.timer);
    const stopped = this.coordinator?.stop();
    for (const operation of this.connections) operation.abort();
    await stopped;
    this.heartbeats.clear();
    this.heartbeatStreams.clear();
    this.runtimeActivations.clear();
    this.verifyingControllers.clear();
    this.enrolmentProgress.clear();
  }

  protected async auditUpdate(record: RuntimeUpdateRecord) {
    const access = await this.required(record.controllerId);
    const session = await this.sessions.findOneByOrFail({ id: access.sessionId });
    const principal = JSON.parse(session.initiatingPrincipal ?? 'null') as PluginAuditPrincipal | null;
    if (!principal || !Number.isSafeInteger(principal.userId) || principal.userId <= 0)
      throw new RuntimeUpdateError('audit');
    const receipt = await this.context.audit.record({
      action: 'wago.runtime_update',
      operationId: randomUUID(),
      principal,
      outcome: record.phase === 'current' ? 'succeeded' : record.failure ? 'failed' : 'attempted',
      subject: { type: 'wago.controller', id: record.controllerId },
      details: {
        phase: record.phase,
        imageId: record.desiredImageId,
        buildId: record.buildId,
        ...(record.installerSha256 ? { installerSha256: record.installerSha256 } : {}),
        ...(record.failure ? { failure: record.failure } : {}),
      },
    });
    if (receipt.status !== 'recorded') throw new RuntimeUpdateError('audit');
  }

  protected updateHost(): ManagedRuntimeUpdateHost {
    const command = async (id: number, action: string, token: string, signal: AbortSignal, extra = '') =>
      this.connection(await this.required(id), `${action} ${token}${extra ? ` ${extra}` : ''}`, signal);
    return {
      inspect: async (id, signal) => {
        const access = await this.required(id);
        const controller = await this.controllers.findOneBy({ id, trustState: 'claimed' });
        const output = await this.connection(access, `inspect ${access.token}`, signal);
        const match = new RegExp(
          `^${MANAGED_HELPER_PROTOCOL}\\n([a-f0-9]{64})\\n(sha256:[a-f0-9]{64}) (true|false)\\n$`,
        ).exec(output);
        if (!match) throw new RuntimeUpdateError('incompatible');
        return {
          imageId: match[2],
          runtimeVersion: this.heartbeats.get(id)?.runtimeVersion ?? controller?.runtimeVersion,
          claimed: !!controller,
          managed: true,
          compatible: true,
          online: match[3] === 'true',
        };
      },
      prepare: async (id, desired, signal) => {
        const access = await this.required(id);
        const inspect = async () => {
          const output = await this.connection(access, `inspect ${access.token}`, signal);
          return new RegExp(
            `^${MANAGED_HELPER_PROTOCOL}\\n([a-f0-9]{64})\\n(sha256:[a-f0-9]{64}) (true|false)\\n$`,
          ).exec(output);
        };
        let match = await inspect();
        if (!match) throw new RuntimeUpdateError('incompatible');
        const helper = managedHostHelper(desired);
        const digest = createHash('sha256').update(helper).digest('hex');
        if (match[1] !== digest) {
          const signature = signInstaller(this.credentials(access).installerPrivateKey, access.token, helper);
          if (
            (await this.connection(
              access,
              `installer-publish ${access.token} ${digest} ${Buffer.byteLength(helper)} ${signature}`,
              signal,
              Buffer.from(helper),
            )) !== 'OK\n'
          )
            throw new RuntimeUpdateError('incompatible');
          match = await inspect();
        }
        if (match?.[1] !== digest) throw new RuntimeUpdateError('incompatible');
      },
      stage: async (id, token, desired, signal) => {
        const bundle = await this.artifacts.acquire(desired.digest);
        try {
          await this.connection(
            await this.required(id),
            `stage ${token} ${desired.digest} ${desired.bytes} ${desired.imageId} ${desired.image}`,
            signal,
            bundle.path,
          );
        } catch (error) {
          throw error instanceof RuntimeUpdateError ? error : new RuntimeUpdateError('transfer');
        } finally {
          await bundle.cleanup();
        }
      },
      activate: async (id, token, artifact, signal) => {
        const heartbeat = this.heartbeats.get(id);
        // Managed SSH and the token-owned staged journal prove which container
        // is being replaced. A stalled runtime must not need MQTT to repair it.
        this.runtimeActivations.set(token, {
          imageId: artifact.imageId,
          startedAt: Date.now(),
          previousStreamId: heartbeat?.streamId,
        });
        this.verifyingControllers.add(id);
        await command(id, 'activate', token, signal);
      },
      verify: async (id, _token, imageId, since, signal) => {
        const controller = await this.controllers.findOneByOrFail({ id, trustState: 'claimed' });
        if (!controller.mqttServerId) throw new RuntimeUpdateError('offline');
        const prefix = (await this.wago.getSettings()).operationalPrefix;
        const activation = _token === null ? undefined : this.runtimeActivations.get(_token);
        const freshSince = Math.max(since, activation?.startedAt ?? since);
        for (let attempt = 0; attempt < 120; attempt++) {
          signal.throwIfAborted();
          const heartbeat = this.heartbeats.get(id);
          const state = this.readiness.observe(controller.mqttServerId, controller.hardwareId, prefix);
          if (
            heartbeat?.imageId === imageId &&
            (_token === null ||
              (activation?.imageId === imageId && heartbeat.streamId !== activation.previousStreamId)) &&
            heartbeat.timestamp > freshSince &&
            heartbeat.receivedAt > freshSince &&
            Date.now() - heartbeat.receivedAt < 90_000 &&
            state?.timestamp > freshSince &&
            Date.now() - state.timestamp < 90_000 &&
            state.streamId === heartbeat.streamId &&
            state.ready
          )
            return { imageId, observedAt: heartbeat.receivedAt, permanent: true, ready: true };
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        throw new RuntimeUpdateError('readiness');
      },
      accept: async (id, token, signal) => {
        await command(id, 'accept', token, signal);
      },
      acknowledge: async (id, token, signal) => {
        try {
          await command(id, 'acknowledge', token, signal);
        } finally {
          this.runtimeActivations.delete(token);
          this.verifyingControllers.delete(id);
        }
      },
      recover: async (id, token, previous, signal) => {
        try {
          await command(id, 'recover', token, signal, previous);
        } finally {
          this.runtimeActivations.delete(token);
          this.verifyingControllers.delete(id);
        }
      },
    };
  }

  protected updateStore(): RuntimeUpdateStore {
    const owners = new Map<string, string>();
    return {
      acquire: async (controllerId, owner, now, until) => {
        const access = await this.required(controllerId);
        if (!(await this.operations.acquire(access.fingerprint, owner, now, until))) return false;
        try {
          await this.assertNetworkSettled(controllerId);
          await this.required(controllerId);
        } catch (error) {
          await this.operations.release(access.fingerprint, owner);
          throw error;
        }
        owners.set(owner, access.fingerprint);
        await this.updates.createQueryBuilder().insert().values({ controllerId }).orIgnore().execute();
        return true;
      },
      load: async (controllerId) => {
        const row = await this.updates.findOneBy({ controllerId });
        return row?.metadata ? (JSON.parse(row.metadata) as RuntimeUpdateRecord) : null;
      },
      save: async (record, owner, now) => {
        const fingerprint = owners.get(owner);
        if (!fingerprint) throw new Error('Update lease lost');
        const result = await this.updates
          .createQueryBuilder()
          .update()
          .set({ metadata: JSON.stringify(record) })
          .where(
            'controller_id = :controllerId AND EXISTS (SELECT 1 FROM plugin_wago_device_operations WHERE fingerprint = :fingerprint AND owner = :owner AND lease_until > :now)',
            { controllerId: record.controllerId, fingerprint, owner, now },
          )
          .execute();
        if (result.affected !== 1) throw new Error('Update lease lost');
      },
      release: async (_id, owner) => {
        const fingerprint = owners.get(owner);
        if (fingerprint) await this.operations.release(fingerprint, owner);
        owners.delete(owner);
      },
    };
  }
}
