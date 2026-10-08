import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { managedHostHelper } from './helper';

import { MANAGED_HELPER_PROTOCOL, signInstaller, generateInstallerAuthority, installerPublicKey } from './installer';

import {
  RuntimeUpdateError,
  RuntimeUpdateRecord,
  runtimeTargetImageId,
  WagoRuntimeUpdateCoordinator,
} from '../update/coordinator';

import { ConflictException, NotFoundException } from '@nestjs/common';

import { WagoNetworkChange, WagoMqttCredentialRetirement } from '../../network/entity';

import { type PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';

import { WagoManagedAccess, WagoRuntimeUpdateEntity, WagoDeviceOperation } from './access.entity';

import { generateManagementKey, restoreManagementKey } from '../../management/key';

import { managedProvisionScript } from './provision';

import { WagoManagedProvisioningError, type ManagedProvisioningStage } from './provisioning-error';

import { WagoCommissioningSession } from '../../commissioning/session.entity';

import { Credentials, RootProbe, RootAcceptance } from './contracts';

import { WagoDeviceOperations } from '../device-operations';

import { WagoController } from '../../controllers/entity';

import { admitEnvelope, emptyStream } from '../../diagnostics/envelope';

import { WagoManagedRuntimeServiceState } from './state';

export abstract class WagoManagedRuntimeEnrollment extends WagoManagedRuntimeServiceState {
  networkChanged(controllerId: number): void {
    this.heartbeats.delete(controllerId);
    this.heartbeatStreams.delete(controllerId);
    this.wago.blockRuntime?.(controllerId);
    this.wake();
  }

  /** Uses the replacement address on the FIRST SSH connection. The stored
   * credential binding is validated at its original address; only the transport
   * destination changes, with the same pinned host identity and managed key.
   */
  async networkManagement(controllerId: number, targetHost: string, signal: AbortSignal) {
    const access = await this.required(controllerId);
    const credentials = this.credentials(access);
    const session = await this.sessions.findOneBy({ id: access.sessionId });
    if (
      !session ||
      session.state !== 'completed' ||
      session.targetHost !== access.host ||
      session.hostKeyFingerprint !== access.fingerprint ||
      session.hardwareId !== credentials.hardwareId
    )
      throw new RuntimeUpdateError('management_required');
    const command = (header: string, payload?: Buffer) => this.connection(access, header, signal, payload, targetHost);
    const nonce = randomBytes(16).toString('hex');
    if ((await command(`proof ${nonce}`)) !== `OK ${nonce}\n`) throw new RuntimeUpdateError('authentication');
    const plaintext = JSON.stringify({ ...credentials, host: targetHost });
    const encryptedCredentials = this.context.secrets.encrypt(plaintext);
    if (
      !encryptedCredentials ||
      encryptedCredentials === plaintext ||
      this.context.secrets.decrypt(encryptedCredentials) !== plaintext
    )
      throw new RuntimeUpdateError('management_required');
    return {
      sessionId: access.sessionId,
      fingerprint: access.fingerprint,
      hardwareId: credentials.hardwareId,
      managementToken: access.token,
      encryptedCredentials,
      command,
      prepare: async () => {
        const desired = await this.desired();
        const helper = managedHostHelper(desired);
        const digest = createHash('sha256').update(helper).digest('hex');
        const inspect = () => command(`inspect ${access.token}`);
        const pattern = new RegExp(
          `^${MANAGED_HELPER_PROTOCOL}\\n([a-f0-9]{64})\\n(sha256:[a-f0-9]{64}) (true|false)\\n$`,
        );
        let match = pattern.exec(await inspect());
        if (!match) throw new RuntimeUpdateError('incompatible');
        if (match[1] !== digest) {
          const signature = signInstaller(credentials.installerPrivateKey, access.token, helper);
          if (
            (await command(
              `installer-publish ${access.token} ${digest} ${Buffer.byteLength(helper)} ${signature}`,
              Buffer.from(helper),
            )) !== 'OK\n'
          )
            throw new RuntimeUpdateError('incompatible');
          match = pattern.exec(await inspect());
        }
        if (match?.[1] !== digest) throw new RuntimeUpdateError('incompatible');
      },
    };
  }

  async assertNetworkSettled(controllerId: number | null, fingerprint?: string): Promise<void> {
    if (controllerId === null && !fingerprint) return;
    const change = await this.context
      .getRepository(WagoNetworkChange)
      .findOneBy(controllerId === null ? { fingerprint } : { controllerId });
    if (change && change.phase !== 'completed')
      throw new ConflictException('Finish the pending MQTT/address change before another controller operation.');
  }

  protected async assertUpdateSettled(controllerId: number): Promise<void> {
    await this.assertNetworkSettled(controllerId);
    const row = await this.updates.findOneBy({ controllerId });
    const update = row?.metadata ? (JSON.parse(row.metadata) as RuntimeUpdateRecord) : null;
    if (update?.token) throw new ConflictException('Finish runtime update recovery before removing this controller');
  }

  async assertRemovable(controllerId: number): Promise<void> {
    await this.assertUpdateSettled(controllerId);
    if (await this.context.getRepository(WagoMqttCredentialRetirement).countBy({ controllerId }))
      throw new ConflictException('Retire previous broker credentials before removing this controller.');
    const access = await this.access.findOne({ where: { controllerId }, order: { sessionId: 'DESC' } });
    if (access && access.state !== 'retired')
      throw new ConflictException('Restore bootstrap SSH and retire managed access before removing this controller');
  }

  async retire(controllerId: number): Promise<void> {
    await this.assertRemovable(controllerId);
    await this.access.update({ controllerId }, { state: 'retired' });
    this.heartbeats.delete(controllerId);
  }

  async recoverPassword(sessionId: number, principal: PluginAuditPrincipal): Promise<{ password: string }> {
    const access = await this.loadSession(sessionId);
    if (!access) throw new NotFoundException('Managed recovery credential not found');
    // Fail closed on missing/unavailable durable audit. Never put secret material in event details.
    const operationId = randomUUID();
    await this.securityAudit(sessionId, 'root_recovery', principal, operationId, 'attempted');
    try {
      const password = this.credentials(access).recoveryPassword;
      await this.securityAudit(sessionId, 'root_recovery', principal, operationId, 'succeeded');
      return { password };
    } catch (error) {
      await this.securityAudit(sessionId, 'root_recovery', principal, operationId, 'failed').catch(() => undefined);
      throw error;
    }
  }

  protected async publicStatus(access: WagoManagedAccess | null, requestedControllerId?: number) {
    if (access && !['retiring', 'retired'].includes(access.state)) {
      try {
        const stored = await this.loadSession(access.sessionId);
        if (!stored) throw new Error();
        this.credentials(stored);
      } catch {
        await this.setActiveState(access.sessionId, 'recovery_required').catch(() => undefined);
        access = await this.access.findOneBy({ sessionId: access.sessionId });
      }
    }
    const row = access?.controllerId ? await this.updates.findOneBy({ controllerId: access.controllerId }) : null;
    const controllerId = requestedControllerId ?? access?.controllerId;
    const controller = controllerId ? await this.controllers.findOneBy({ id: controllerId }) : null;
    const desired = controller ? await this.artifacts.current().catch(() => null) : null;
    const managementSetup =
      access?.state === 'verified'
        ? (this.enrolmentProgress.get(controllerId ?? 0) ?? {
            state: 'waiting' as const,
            reason: controller
              ? ((await this.enrolmentWaitReason(
                  controller,
                  await this.sessions.findOneBy({ id: access.sessionId }),
                )) ?? 'scheduled')
              : 'connection',
          })
        : undefined;
    const managementFailure =
      access && ['verified', 'recovery_required'].includes(access.state)
        ? (await this.sessions.findOneBy({ id: access.sessionId }))?.failureReason
        : null;
    return {
      ...(managementFailure ? { managementFailure } : {}),
      sessionId: access?.sessionId ?? null,
      management: access?.state ?? 'reenrol_required',
      keyFingerprint: access?.keyFingerprint ?? null,
      update: row?.metadata ? (JSON.parse(row.metadata) as RuntimeUpdateRecord) : null,
      ...(managementSetup ? { managementSetup } : {}),
      ...(controller
        ? {
            runtime: {
              runningVersion: controller.runtimeVersion,
              runningImageId: this.heartbeats.get(controller.id)?.imageId || null,
              desiredVersion: desired?.manifest.runtimeVersion ?? null,
              desiredImageId:
                desired && 'imageId' in desired
                  ? runtimeTargetImageId(desired, {
                      imageId: this.heartbeats.get(controller.id)?.imageId ?? '',
                      runtimeVersion: this.heartbeats.get(controller.id)?.runtimeVersion ?? controller.runtimeVersion,
                    })
                  : null,
            },
          }
        : {}),
      ...(access?.controllerId && this.wago.isRuntimeUpdateRequired
        ? { runtimeUpdateRequired: this.wago.isRuntimeUpdateRequired(access.controllerId) }
        : {}),
      ...(access?.controllerId && this.reconciliationFailures.has(access.controllerId)
        ? { blocker: this.reconciliationFailures.get(access.controllerId) }
        : {}),
      physicalQualification: 'unverified' as const,
    };
  }

  async sessionStatus(sessionId: number) {
    return this.publicStatus(await this.access.findOneBy({ sessionId }));
  }

  async status(controllerId: number) {
    const access = await this.access.findOne({ where: { controllerId }, order: { sessionId: 'DESC' } });
    return this.publicStatus(access, controllerId);
  }

  /** Called inside the commissioning device lease, with fresh bootstrap credentials.
   * DB encryption/storage completes before account/password mutation. The generated
   * root password is independently authenticated before SSH policy can change.
   */
  async enrol(
    session: WagoCommissioningSession,
    execute: (script: string) => Promise<string>,
    signal: AbortSignal,
  ): Promise<void> {
    const desired = await this.desired();
    let access = await this.loadSession(session.id);
    if (
      access &&
      (access.fingerprint !== session.hostKeyFingerprint ||
        access.host !== session.targetHost ||
        ['retiring', 'retired'].includes(access.state))
    )
      throw new ConflictException('Managed identity changed; create a fresh enrolment session.');
    if (!access) {
      const key = generateManagementKey();
      const credentials: Credentials = {
        sessionId: session.id,
        host: session.targetHost,
        hardwareId: session.hardwareId,
        fingerprint: session.hostKeyFingerprint,
        token: randomBytes(16).toString('hex'),
        privateKey: key.privateKey,
        recoveryPassword: randomBytes(32).toString('base64url'),
        installerPrivateKey: generateInstallerAuthority().privateKey,
      };
      const plaintext = JSON.stringify(credentials);
      const encryptedCredentials = this.context.secrets.encrypt(plaintext);
      if (
        !encryptedCredentials ||
        encryptedCredentials === plaintext ||
        this.context.secrets.decrypt(encryptedCredentials) !== plaintext
      )
        throw new ConflictException('Managed credential encryption failed.');
      access = await this.access.save(
        this.access.create({
          sessionId: session.id,
          controllerId: null,
          host: session.targetHost,
          fingerprint: session.hostKeyFingerprint,
          token: credentials.token,
          state: 'pending',
          encryptedCredentials,
          keyFingerprint: key.fingerprint,
        }),
      );
      key.privateKey = '';
      // Verify the persisted envelope, rather than the ORM save result, before
      // replacing any remote password or key. Storage failures leave SSH intact.
      access = await this.loadSession(session.id);
      if (!access) throw new ConflictException('Managed credential storage verification failed.');
    }
    const credentials = this.credentials(access);
    if (credentials.hardwareId !== session.hardwareId)
      throw new ConflictException('Managed credentials belong to another controller identity');
    let stage: ManagedProvisioningStage = 'filesystem';
    try {
      if (access.state !== 'verified' && access.state !== 'managed') {
        const key = restoreManagementKey(credentials.privateKey, access.keyFingerprint);
        if (
          (await execute(
            managedProvisionScript(
              access.token,
              key.publicKey,
              credentials.recoveryPassword,
              managedHostHelper(desired),
              '',
              installerPublicKey(credentials.installerPrivateKey),
            ),
          )) !== 'OK\n'
        )
          throw new Error();
      }
      stage = 'proof';
      await this.prove(access, signal);
      stage = 'root';
      if (!this.rootProbe || !(await this.rootProbe(access.host, access.fingerprint, credentials.recoveryPassword)))
        throw new Error();
      await this.setActiveState(access.sessionId, 'verified');
      stage = 'commit';
      if ((await this.connection(access, `access-key-commit ${access.token}`, signal)) !== 'OK\n') throw new Error();
      await this.prove(access, signal);
    } catch (error) {
      await this.setActiveState(access.sessionId, 'recovery_required');
      throw error instanceof WagoManagedProvisioningError ? error : new WagoManagedProvisioningError(stage);
    }
  }

  async bind(sessionId: number, controllerId: number): Promise<void> {
    const access = await this.loadSession(sessionId);
    if (!access) return;
    if (access.state !== 'verified' || (access.controllerId !== null && access.controllerId !== controllerId))
      throw new ConflictException('Managed enrolment is not verified for this controller');
    await this.access.update(sessionId, { controllerId });
  }

  registerRetirementProbe(probe: RootProbe): void {
    this.retirementProbe = probe;
  }

  registerPreparationAcceptance(accept: RootAcceptance): void {
    this.rootAcceptance = accept;
  }

  registerRootProbe(probe: RootProbe): void {
    this.rootProbe = probe;
  }

  public onApplicationBootstrap(): void {
    this.access = this.context.getRepository(WagoManagedAccess);
    this.updates = this.context.getRepository(WagoRuntimeUpdateEntity);
    this.sessions = this.context.getRepository(WagoCommissioningSession);
    this.controllers = this.context.getRepository(WagoController);
    this.operations = new WagoDeviceOperations(this.context.getRepository(WagoDeviceOperation));
    this.coordinator = new WagoRuntimeUpdateCoordinator(
      this.updateStore(),
      () => this.desired(),
      this.updateHost(),
      (record) => this.auditUpdate(record),
    );
    this.wago.registerRuntimeStatusHandler((id, heartbeat) => {
      const stream = this.heartbeatStreams.get(id) ?? emptyStream();
      if (
        admitEnvelope(
          stream,
          { ...heartbeat, timestamp: new Date(heartbeat.timestamp).toISOString() },
          'heartbeat',
          Date.now(),
        ) === 'rejected'
      )
        return;
      this.heartbeatStreams.set(id, stream);
      const previous = this.heartbeats.get(id);
      this.heartbeats.delete(id);
      this.heartbeats.set(id, heartbeat);
      if (this.heartbeats.size > 200) {
        const oldest = [...this.heartbeats.keys()].find((candidate) => !this.verifyingControllers.has(candidate));
        if (oldest !== undefined) {
          this.heartbeats.delete(oldest);
          this.heartbeatStreams.delete(oldest);
        }
      }
      if (
        !previous ||
        previous.runtimePolicyToken !== heartbeat.runtimePolicyToken ||
        previous.streamId !== heartbeat.streamId ||
        previous.imageId !== heartbeat.imageId ||
        previous.runtimeVersion !== heartbeat.runtimeVersion ||
        heartbeat.receivedAt - previous.receivedAt > 90_000
      ) {
        this.wago.blockRuntime?.(id);
        if (!this.connectingControllers.has(id) && this.connectingControllers.size < 200) {
          this.connectingControllers.add(id);
          void this.reconcileConnection(id)
            .catch((error) => {
              this.reconciliationFailures.set(id, error instanceof RuntimeUpdateError ? error.failure : 'interrupted');
              this.context.logger.warn(`CC100 ${id} runtime update requires attention.`);
            })
            .finally(() => this.connectingControllers.delete(id));
        } else {
          // The new boot needs policy confirmation while its updater is waiting
          // for readiness. Never queue that confirmation behind the update itself.
          void this.refreshRuntimePolicy(id).catch((error) => {
            this.reconciliationFailures.set(id, error instanceof RuntimeUpdateError ? error.failure : 'interrupted');
          });
        }
      }
      this.wake();
    });
    this.timer = setInterval(() => this.wake(), 30_000).unref();
    this.wake();
  }
}
