import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type { PluginAuditPrincipal, PluginContext, Repository } from '@attraccess/plugins-backend-sdk';
import { WagoManagedAccess, WagoRuntimeUpdateEntity, WagoDeviceOperation } from './wago-managed-access.entity';
import { WagoDeviceOperations } from './wago-device-operations';
import { generateManagementKey, restoreManagementKey } from './wago-management-key';
import { managedHostHelper } from './wago-managed-helper';
import {
  generateInstallerAuthority,
  installerPublicKey,
  MANAGED_HELPER_PROTOCOL,
  signInstaller,
} from './wago-managed-installer';
import { managedProvisionScript, managedWatchdogScript } from './wago-managed-provision';
import type { CommissioningManagementRefresh } from './wago-commissioning-accept';
import { WagoManagedProvisioningError, type ManagedProvisioningStage } from './wago-managed-provisioning-error';
import { managedSsh } from './wago-managed-ssh';
import { managedSetupFailure, type ManagedSetupStage } from './wago-managed-setup-error';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import type { BuildRuntimeArtifact } from './wago-build-runtime';
import {
  WagoRuntimeUpdateCoordinator,
  RuntimeUpdateError,
  runtimeTargetImageId,
  type RuntimeUpdateRecord,
  type RuntimeUpdateStore,
  type ManagedRuntimeUpdateHost,
  type RuntimeUpdateFailure,
} from './wago-runtime-update';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoController } from './wago-controller.entity';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import { WagoService } from './wago.service';
import { commissioningVerification } from './wago-commissioning-verification';
import { admitEnvelope, emptyStream, type DiagnosticStream } from './diagnostics-envelope';
import { WagoNetworkChange, WagoMqttCredentialRetirement } from './wago-network-change.entity';

type Credentials = {
  sessionId: number;
  host: string;
  hardwareId: string;
  fingerprint: string;
  token: string;
  privateKey: string;
  recoveryPassword: string;
  installerPrivateKey: string;
};
type RootAcceptance = (
  host: string,
  fingerprint: string,
  password: string,
  token: string,
  guard: import('./wago-operation-guard').CommissioningOperationGuard,
  management: CommissioningManagementRefresh,
) => Promise<void>;
type RootProbe = (host: string, fingerprint: string, password: string) => Promise<boolean>;
type LiveHeartbeat = {
  imageId: string;
  runtimeVersion?: string;
  streamId: string;
  timestamp: number;
  receivedAt: number;
  runtimePolicyToken?: string;
};
type ManagementSetupReason =
  | 'session'
  | 'server_setup'
  | 'connection'
  | 'runtime_state'
  | 'enrollment_credentials'
  | 'configuration'
  | 'readiness';
type ManagementSetup =
  | { state: 'waiting'; reason: ManagementSetupReason | 'scheduled' }
  | { state: 'running'; reason: 'preparation' | 'ssh_cutover' | 'reboot' | 'confirmation' };

/** Production wiring for new enrolments. Legacy registrations are never silently
 * adopted; delete/re-enrol to obtain the managed identity and helper contract.
 */
@Injectable()
export class WagoManagedRuntimeService implements OnApplicationBootstrap, OnModuleDestroy {
  private access!: Repository<WagoManagedAccess>;
  private updates!: Repository<WagoRuntimeUpdateEntity>;
  private sessions!: Repository<WagoCommissioningSession>;
  private controllers!: Repository<WagoController>;
  private operations!: WagoDeviceOperations;
  private coordinator!: WagoRuntimeUpdateCoordinator;
  private readonly heartbeats = new Map<number, LiveHeartbeat>();
  private readonly heartbeatStreams = new Map<number, DiagnosticStream>();
  private readonly runtimeActivations = new Map<
    string,
    { imageId: string; startedAt: number; previousStreamId?: string }
  >();
  private readonly verifyingControllers = new Set<number>();
  private readonly connectingControllers = new Set<number>();
  private readonly reconciliationFailures = new Map<number, RuntimeUpdateFailure>();
  private readonly enrolmentProgress = new Map<number, ManagementSetup>();
  private timer?: ReturnType<typeof setInterval>;
  private destroyed = false;
  private scanning = false;
  private nextScanAt = 0;
  private rootProbe?: RootProbe;
  private rootAcceptance?: RootAcceptance;
  private retirementProbe?: RootProbe;
  private readonly connections = new Set<AbortController>();

  constructor(
    @Inject(Symbol.for('attraccess.plugin.context')) private readonly context: PluginContext,
    @Inject(WagoService) private readonly wago: WagoService,
    @Inject(WagoRuntimeArtifactsService) private readonly artifacts: WagoRuntimeArtifactsService,
    @Inject(WagoCommissioningReadiness) private readonly readiness: WagoCommissioningReadiness,
  ) {}

  onApplicationBootstrap(): void {
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

  registerRootProbe(probe: RootProbe): void {
    this.rootProbe = probe;
  }

  registerPreparationAcceptance(accept: RootAcceptance): void {
    this.rootAcceptance = accept;
  }

  registerRetirementProbe(probe: RootProbe): void {
    this.retirementProbe = probe;
  }

  async bind(sessionId: number, controllerId: number): Promise<void> {
    const access = await this.loadSession(sessionId);
    if (!access) return;
    if (access.state !== 'verified' || (access.controllerId !== null && access.controllerId !== controllerId))
      throw new ConflictException('Managed enrolment is not verified for this controller');
    await this.access.update(sessionId, { controllerId });
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

  async status(controllerId: number) {
    const access = await this.access.findOne({ where: { controllerId }, order: { sessionId: 'DESC' } });
    return this.publicStatus(access, controllerId);
  }

  async sessionStatus(sessionId: number) {
    return this.publicStatus(await this.access.findOneBy({ sessionId }));
  }

  private async publicStatus(access: WagoManagedAccess | null, requestedControllerId?: number) {
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

  async retire(controllerId: number): Promise<void> {
    await this.assertRemovable(controllerId);
    await this.access.update({ controllerId }, { state: 'retired' });
    this.heartbeats.delete(controllerId);
  }

  async assertRemovable(controllerId: number): Promise<void> {
    await this.assertUpdateSettled(controllerId);
    if (await this.context.getRepository(WagoMqttCredentialRetirement).countBy({ controllerId }))
      throw new ConflictException('Retire previous broker credentials before removing this controller.');
    const access = await this.access.findOne({ where: { controllerId }, order: { sessionId: 'DESC' } });
    if (access && access.state !== 'retired')
      throw new ConflictException('Restore bootstrap SSH and retire managed access before removing this controller');
  }

  private async assertUpdateSettled(controllerId: number): Promise<void> {
    await this.assertNetworkSettled(controllerId);
    const row = await this.updates.findOneBy({ controllerId });
    const update = row?.metadata ? (JSON.parse(row.metadata) as RuntimeUpdateRecord) : null;
    if (update?.token) throw new ConflictException('Finish runtime update recovery before removing this controller');
  }

  async assertNetworkSettled(controllerId: number | null, fingerprint?: string): Promise<void> {
    if (controllerId === null && !fingerprint) return;
    const change = await this.context
      .getRepository(WagoNetworkChange)
      .findOneBy(controllerId === null ? { fingerprint } : { controllerId });
    if (change && change.phase !== 'completed')
      throw new ConflictException('Finish the pending MQTT/address change before another controller operation.');
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

  networkChanged(controllerId: number): void {
    this.heartbeats.delete(controllerId);
    this.heartbeatStreams.delete(controllerId);
    this.wago.blockRuntime?.(controllerId);
    this.wake();
  }

  async hasAccess(sessionId: number): Promise<boolean> {
    return !!(await this.access.findOneBy({ sessionId }));
  }

  /** Used only inside an audited commissioning recovery and its device lock.
   * A failed FW31 preflight may leave the factory password unchanged, so prove
   * the encrypted recovery login before selecting it. Never disclose it to UI.
   */
  async commissioningRecoveryPassword(session: WagoCommissioningSession): Promise<string | null> {
    const access = await this.loadSession(session.id);
    if (!access || !this.rootProbe || !['pending', 'verified', 'recovery_required'].includes(access.state)) return null;
    const credentials = this.credentials(access);
    if (
      access.host !== session.targetHost ||
      access.fingerprint !== session.hostKeyFingerprint ||
      credentials.hardwareId !== session.hardwareId
    )
      throw new ConflictException('Managed recovery identity changed; check the saved controller identity.');
    return (await this.rootProbe(access.host, access.fingerprint, credentials.recoveryPassword))
      ? credentials.recoveryPassword
      : null;
  }

  async restoreAccess(sessionId: number, principal: PluginAuditPrincipal): Promise<void> {
    const access = await this.loadSession(sessionId);
    if (!access || !this.rootProbe || !this.retirementProbe)
      throw new NotFoundException('Managed recovery access not found');
    if (access.controllerId) await this.assertUpdateSettled(access.controllerId);
    const owner = randomBytes(16).toString('hex');
    if (!(await this.operations.acquire(access.fingerprint, owner, Date.now(), Date.now() + 60_000)))
      throw new ConflictException('Controller is busy');
    const operation = new AbortController();
    const timer = setTimeout(() => operation.abort(), 50_000).unref();
    const operationId = randomUUID();
    let attempted = false;
    try {
      if (access.controllerId) await this.assertUpdateSettled(access.controllerId);
      await this.securityAudit(sessionId, 'security_recover', principal, operationId, 'attempted');
      attempted = true;
      // Retire automatic access durably before restoring bootstrap policy. A
      // restarted reconciler must not immediately harden it again during recovery.
      await this.access.update(sessionId, { state: 'retiring' });
      const password = this.credentials(access).recoveryPassword;
      // An interrupted key removal may have succeeded. Verify its durable remote
      // result through restored pinned root access before trying the old key again.
      if (!(await this.retirementProbe(access.host, access.fingerprint, password))) {
        await this.connection(access, `access-restore ${access.token}`, operation.signal);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const deadline = Date.now() + 30_000;
        let restored = false;
        while (!operation.signal.aborted && Date.now() < deadline) {
          if (await this.rootProbe(access.host, access.fingerprint, password)) {
            restored = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (!restored)
          throw new ConflictException('Bootstrap SSH restoration is unverified; retry administrator recovery');
        await this.operations.assertOwned(access.fingerprint, owner);
        await this.connection(access, `access-retire ${access.token}`, operation.signal).catch(() => undefined);
      }
      if (!(await this.retirementProbe(access.host, access.fingerprint, password)))
        throw new ConflictException('Managed key retirement is unverified; retry administrator recovery');
      await this.operations.assertOwned(access.fingerprint, owner);
      await this.access.update(sessionId, { state: 'retired' });
      await this.securityAudit(sessionId, 'security_recover', principal, operationId, 'succeeded');
    } catch (error) {
      if (attempted)
        await this.securityAudit(sessionId, 'security_recover', principal, operationId, 'failed').catch(
          () => undefined,
        );
      throw error;
    } finally {
      clearTimeout(timer);
      operation.abort();
      await this.operations.release(access.fingerprint, owner);
    }
  }

  async retryAccess(sessionId: number): Promise<void> {
    let access = await this.loadSession(sessionId);
    if (!access || ['retiring', 'retired'].includes(access.state))
      throw new ConflictException('Managed access cannot be retried');
    const fingerprint = access.fingerprint;
    const owner = randomBytes(16).toString('hex');
    if (!(await this.operations.acquire(access.fingerprint, owner, Date.now(), Date.now() + 60_000)))
      throw new ConflictException('Controller is busy');
    const operation = new AbortController();
    const timer = setTimeout(() => operation.abort(), 50_000).unref();
    try {
      access = await this.loadSession(sessionId);
      if (!access || ['retiring', 'retired'].includes(access.state))
        throw new ConflictException('Managed access cannot be retried');
      if (access.controllerId) await this.assertNetworkSettled(access.controllerId);
      await this.prove(access, operation.signal);
      const status = await this.connection(access, `access-status ${access.token}`, operation.signal);
      await this.operations.assertOwned(access.fingerprint, owner);
      if (status === 'committed\n') {
        if ((await this.connection(access, `access-policy ${access.token}`, operation.signal)) !== 'OK\n')
          throw new Error('Managed SSH policy is unverified');
        await this.setActiveState(sessionId, 'managed');
      } else if (
        status === 'open\n' &&
        this.rootProbe &&
        (await this.rootProbe(access.host, access.fingerprint, this.credentials(access).recoveryPassword))
      ) {
        await this.setActiveState(sessionId, 'verified');
        await this.connection(access, `access-key-commit ${access.token}`, operation.signal);
        await this.prove(access, operation.signal);
      } else throw new ConflictException('Wait for the SSH-policy watchdog to restore access before retrying');
    } finally {
      clearTimeout(timer);
      operation.abort();
      await this.operations.release(fingerprint, owner);
    }
    this.wake();
  }

  private async setActiveState(sessionId: number, state: 'verified' | 'managed' | 'recovery_required'): Promise<void> {
    const result = await this.access
      .createQueryBuilder()
      .update()
      .set({ state })
      .where('session_id = :sessionId AND state NOT IN (:...retired)', {
        sessionId,
        retired: ['retiring', 'retired'],
      })
      .execute();
    if (result.affected !== 1) throw new ConflictException('Managed access is being retired');
  }

  async retryRuntime(controllerId: number): Promise<void> {
    await this.required(controllerId);
    if ((await this.coordinator.reconcile(controllerId, true)) === 'busy')
      throw new ConflictException('Controller is busy; retry after its current operation finishes');
  }

  private async desired(): Promise<BuildRuntimeArtifact> {
    const value = await this.artifacts.current();
    if (
      !value ||
      !('imageId' in value) ||
      !('buildId' in value) ||
      typeof value.imageId !== 'string' ||
      typeof value.buildId !== 'string'
    )
      throw new RuntimeUpdateError('runtime_assets');
    return {
      ...value,
      installerSha256: createHash('sha256')
        .update(managedHostHelper(value as BuildRuntimeArtifact))
        .digest('hex'),
    } as BuildRuntimeArtifact;
  }

  private loadSession(sessionId: number): Promise<WagoManagedAccess | null> {
    return this.access
      .createQueryBuilder('access')
      .addSelect('access.encryptedCredentials')
      .where('access.sessionId = :sessionId', { sessionId })
      .getOne();
  }

  private async required(controllerId: number): Promise<WagoManagedAccess> {
    const row = await this.access
      .createQueryBuilder('access')
      .addSelect('access.encryptedCredentials')
      .where('access.controllerId = :controllerId AND access.state = :state', { controllerId, state: 'managed' })
      .orderBy('access.sessionId', 'DESC')
      .getOne();
    if (!row) throw new RuntimeUpdateError('management_required');
    return row;
  }

  private credentials(access: WagoManagedAccess): Credentials {
    try {
      const value = JSON.parse(this.context.secrets.decrypt(access.encryptedCredentials)) as Credentials;
      if (
        value.sessionId !== access.sessionId ||
        value.host !== access.host ||
        typeof value.hardwareId !== 'string' ||
        !value.hardwareId ||
        value.fingerprint !== access.fingerprint ||
        value.token !== access.token ||
        !/^[A-Za-z0-9_-]{43}$/.test(value.recoveryPassword)
      )
        throw new Error();
      restoreManagementKey(value.privateKey, access.keyFingerprint);
      installerPublicKey(value.installerPrivateKey);
      return value;
    } catch {
      throw new ConflictException('Managed credential envelope is unavailable or does not match this device');
    }
  }

  private async connection(
    access: WagoManagedAccess,
    header: string,
    signal?: AbortSignal,
    file?: string | Buffer,
    targetHost = access.host,
  ) {
    const operation = new AbortController();
    this.connections.add(operation);
    const abort = () => operation.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 25 * 60_000).unref();
    try {
      if (this.destroyed || signal?.aborted) operation.abort();
      let credentials: Credentials;
      try {
        credentials = this.credentials(access);
      } catch {
        throw new RuntimeUpdateError('management_required');
      }
      return await managedSsh({ ...access, host: targetHost }, credentials.privateKey, header, operation.signal, file);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      operation.abort();
      this.connections.delete(operation);
    }
  }

  private async prove(access: WagoManagedAccess, signal?: AbortSignal) {
    const nonce = randomBytes(16).toString('hex');
    if ((await this.connection(access, `proof ${nonce}`, signal)) !== `OK ${nonce}\n`)
      throw new Error('Managed key proof failed');
  }

  private wake() {
    if (this.destroyed || this.scanning || !this.coordinator || Date.now() < this.nextScanAt) return;
    this.nextScanAt = Date.now() + 30_000;
    this.scanning = true;
    void this.scan()
      .catch(() => this.context.logger.warn('Managed CC100 reconciliation requires attention.'))
      .finally(() => {
        this.scanning = false;
      });
  }

  private async refreshRuntimePolicy(id: number): Promise<LiveHeartbeat | undefined> {
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

  private async reconcileConnection(id: number): Promise<void> {
    await this.assertNetworkSettled(id);
    const heartbeat = await this.refreshRuntimePolicy(id);
    if (!heartbeat) return;
    const controller = await this.controllers.findOneBy({ id, trustState: 'claimed' });
    if (controller && (await this.completeEnrolment(controller)))
      await this.coordinator.reconcile(id, true, heartbeat.imageId);
  }

  private async scan() {
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

  private async enrolmentWaitReason(
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

  private async completeEnrolment(controller: WagoController): Promise<boolean> {
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
    } finally {
      this.enrolmentProgress.delete(controller.id);
      clearTimeout(timer);
      operation.abort();
      await this.operations.release(bound.fingerprint, owner);
    }
  }

  private async finishSession(id: number) {
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

  private async securityAudit(
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

  private updateStore(): RuntimeUpdateStore {
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

  private updateHost(): ManagedRuntimeUpdateHost {
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

  private async auditUpdate(record: RuntimeUpdateRecord) {
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

  async onModuleDestroy() {
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
}
