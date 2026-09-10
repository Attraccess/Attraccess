import { isCc100Fw31Identity, wagoFw31IdentityRead } from './wago-firmware-identity';
import { parseWagoCodesysClassification, wagoCodesysClassificationShell } from './wago-codesys-classification';
import { commissionClock } from './wago-commissioning-clock';
import type { WagoCommissioningPreflightReport } from '../shared/commissioning';
import { MANAGEMENT_INSPECTION_COMMAND } from './wago-management-inspection';
import { ManagementPeerVersion } from './wago-management-peer-version';
import {
  commissioningFailure,
  controllerFailureDetail,
  ProcessTermination,
  WagoCommissioningProcessError,
} from './wago-commissioning-errors';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { spawn } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLUGIN_CONTEXT, PluginContext, Repository } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoService } from './wago.service';
import { commissioningVerification } from './wago-commissioning-verification';
import { WagoController } from './wago-controller.entity';
import { assertCommissioningBroker, controllerPreparationBlockers } from './wago-commissioning-preflight';
import { auditCommissioning, commissioningPrincipal, CommissioningPrincipal } from './wago-commissioning-audit';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import type { CommissioningOperationGuard } from './wago-commissioning-lease';
import { createWagoManagementService } from './wago-management-store';
import { ManagementError, WagoManagementService } from './wago-management';
import type { ManagementTarget, ManagementMode, ManagementException } from './wago-management.types';
import { restoreManagementKey } from './wago-management-key';
import {
  wagoHardwareDeploymentReportScript,
  parseWagoHardwareDeploymentReport,
  wagoDockerProvisionRecoveryScript,
  wagoDockerProvisionReconciliationScript,
  wagoDockerProvisionFinishScript,
  wagoCommissioningPreparationScript,
} from './wago-hardware-deployment';
import {
  runtimeBundleDeliveryScript,
  runtimeBundleAcceptScript,
  runtimeBundlePreflightScript,
  runtimeBundleStagingCapacityPreflightScript,
  runtimeBundleRecoveryAcknowledgementScript,
  runtimeBundleRecoveryScript,
  runtimeBundleStreamReceiver,
} from './wago-runtime-install';
export { runtimeBundleInstallScript } from './wago-runtime-install';

const SSH_TIMEOUT_MS = 30 * 60_000;
const BOOTSTRAP_SSH_OPTIONS = [
  '-F',
  '/dev/null',
  '-o',
  'IdentityAgent=none',
  '-o',
  'PubkeyAuthentication=no',
  '-o',
  'PreferredAuthentications=password',
  '-o',
  'KbdInteractiveAuthentication=no',
  '-o',
  'ControlPath=none',
  '-o',
  'GlobalKnownHostsFile=/dev/null',
];
// The initial supported CC100 commissioning baseline. Operators may pin a more
// specific vendor firmware identifier through configuration as it becomes available.
const configuredFirmwareBaseline = process.env.WAGO_CC100_FIRMWARE_BASELINE?.trim() || '31';

type TemporarySshCredential = { username: string; password: string };
type CommissioningSessionResponse = Omit<
  WagoCommissioningSession,
  'pairingCode' | 'deliveryToken' | 'initiatingPrincipal' | 'dockerProvisionToken' | 'encryptedSshCredential'
> & { runtimeRecoveryAvailable?: boolean };
const VERIFIER_PREFIX = 'encrypted:v1:';
type DeliveryInput = { temporarySsh?: TemporarySshCredential; confirmInstall?: boolean };
// FW31's admin account can authenticate over SSH but cannot sudo. Installation
// requires the factory root account (or an explicitly supplied privileged account).
const FACTORY_SSH_CREDENTIAL: TemporarySshCredential = Object.freeze({ username: 'root', password: 'wago' });
type SshCommandLimits = { timeoutMs: number; maxOutputBytes: number; readOnly?: boolean };
const DELIVERY_PHASES = {
  validating: [
    71,
    'Verifying transferred runtime',
    'The controller received the complete bundle and is checking its checksum.',
  ],
  installing: [72, 'Installing runtime', 'Checking controller IO ownership and preparing the runtime installation.'],
  loading: [74, 'Loading runtime image', 'Loading the verified image into the controller Docker engine.'],
  starting: [76, 'Starting runtime', 'Starting the runtime with restricted onboard IO access.'],
  supervising: [
    78,
    'Verifying runtime supervisor',
    'Waiting for a complete controller startup gate and supervisor acknowledgement.',
  ],
} as const;
type RuntimeDeliveryPhase = keyof typeof DELIVERY_PHASES;
type RuntimeDeliveryProgress = (percent: number, phase?: RuntimeDeliveryPhase) => void;

@Injectable()
export class WagoCommissioningService implements OnApplicationBootstrap, OnModuleDestroy {
  private sessions!: Repository<WagoCommissioningSession>;
  private management!: WagoManagementService;
  private readonly operationContext = new AsyncLocalStorage<CommissioningOperationGuard>();
  private readonly uncertainRemoteOperations = new WeakSet<CommissioningOperationGuard>();
  private readonly transferWrites = new Map<number, Promise<void>>();
  private readonly controllerLocks = new Map<string, Promise<void>>();
  private readonly deliveryLocks = new Map<number, Promise<void>>();
  private reconciliationTimer?: ReturnType<typeof setInterval>;
  private reconciling = false;

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(WagoService) private readonly wago: WagoService,
    @Optional() @Inject(WagoRuntimeArtifactsService) private readonly artifacts?: WagoRuntimeArtifactsService,
    @Optional() @Inject(WagoCommissioningReadiness) private readonly readiness?: WagoCommissioningReadiness,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // The host datasource is available only after plugin module construction completes.
    this.sessions = this.context.getRepository(WagoCommissioningSession);
    this.management = createWagoManagementService(this.context, {
      execute: (target, credential, command, limits) =>
        this.run(target.host, target.hostKeyFingerprint, credential, command, undefined, limits),
      verifyNewKeyConnection: (target, username, privateKey, nonce, limits) =>
        this.verifyManagementKey(target, username, privateKey, nonce, limits),
    });
    try {
      await this.recoverSessions();
      await this.reconcileCompletedSessions();
      this.wago.registerCommissioningDiscoveryHandler((controller) => this.claimDiscovered(controller));
      void this.reconcileDiscovery().catch(() =>
        this.context.logger?.warn('Saved commissioning discovery requires attention.'),
      );
      if (this.readiness) {
        this.reconciliationTimer = setInterval(() => void this.reconcileEnrollments(), 5_000).unref();
      }
    } catch {
      this.context.logger?.warn('WAGO commissioning recovery failed; automatic discovery claim is disabled.');
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.reconciliationTimer);
  }

  async support(): Promise<{ firmwareBaseline: string | null; ready: boolean }> {
    return {
      firmwareBaseline: configuredFirmwareBaseline || null,
      ready: Boolean(await this.artifacts?.has()),
    };
  }

  async create(
    input: {
      mqttServerId: number;
      targetHost: string;
      name: string;
    },
    principal: CommissioningPrincipal | null = null,
  ): Promise<CommissioningSessionResponse> {
    if (!isPrivateAddress(input.targetHost))
      throw new ConflictException('commissioning is limited to a private controller address');
    if (!input.name.trim()) throw new ConflictException('a controller name is required');
    if (!configuredFirmwareBaseline)
      throw new ConflictException(
        'no CC100 firmware baseline is configured; commissioning is disabled until an exact supported baseline is set',
      );
    let brokerAvailable: boolean;
    try {
      brokerAvailable = Boolean(await this.context.getMqttServerConfig(input.mqttServerId));
    } catch {
      throw new ConflictException('Commissioning MQTT configuration could not be resolved.');
    }
    if (!brokerAvailable) throw new NotFoundException('MQTT server not found');

    let hostKeyFingerprint: string;
    try {
      hostKeyFingerprint = await scanHostKey(input.targetHost);
    } catch {
      throw new ConflictException('Commissioning SSH host-key scan failed.');
    }
    const hardwareId = `cc100-${createHash('sha256').update(hostKeyFingerprint).digest('hex').slice(0, 16)}`;
    const now = new Date().toISOString();
    const runtimeArtifactDigest = (await this.artifacts?.current())?.digest ?? null;
    if (!runtimeArtifactDigest) throw new ConflictException('The bundled CC100 runtime is unavailable.');
    const session = await this.sessions.save(
      this.sessions.create({
        hardwareId,
        mqttServerId: input.mqttServerId,
        targetHost: input.targetHost,
        hostKeyFingerprint,
        firmwareBaseline: configuredFirmwareBaseline,
        controllerName: input.name.trim(),
        state: 'awaiting_identity_confirmation',
        enrollmentExpiresAt: null,
        enrollmentId: null,
        // This verifier authenticates the first runtime announcement and is never exposed to an operator.
        pairingCode: this.encryptVerifier(randomBytes(32).toString('base64url')),
        initiatingPrincipal: principal ? JSON.stringify(principal) : null,
        runtimeArtifactDigest,
        codesysState: null,
        progressPercent: 0,
        progressStep: 'Confirm controller identity',
        progressDetail: 'Verify the scanned SSH host-key fingerprint on the controller before delivery.',
        auditLog: JSON.stringify([{ at: now, event: 'host_key_scanned' }]),
        failureReason: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    return this.toResponse(session);
  }

  async confirmHostKey(
    id: number,
    hostKeyFingerprint: string,
    trustMethod: 'trusted_inventory' | 'isolated_service_connection' = 'trusted_inventory',
    physicalIdentityConfirmed = false,
  ): Promise<CommissioningSessionResponse> {
    if (
      !['trusted_inventory', 'isolated_service_connection'].includes(trustMethod) ||
      (trustMethod === 'isolated_service_connection' && physicalIdentityConfirmed !== true)
    )
      throw new ConflictException('Confirm the isolated service connection and physical controller identity.');
    return this.withDeliveryLock(id, async () => {
      const session = await this.sessions.findOneBy({ id });
      if (!session) throw new NotFoundException('commissioning session not found');
      if (session.state !== 'awaiting_identity_confirmation')
        throw new ConflictException('commissioning session identity cannot be confirmed in its current state');
      if (hostKeyFingerprint !== session.hostKeyFingerprint)
        throw new ConflictException(
          'the supplied SSH host-key fingerprint does not match the scanned controller identity',
        );

      session.state = 'awaiting_delivery';
      session.progressPercent = 0;
      session.progressStep = 'Identity confirmed';
      session.progressDetail =
        trustMethod === 'trusted_inventory'
          ? 'The administrator compared the SSH host key with an independent trusted record.'
          : 'The operator confirmed a physically isolated service connection. This is first-key pinning on that connection, not independent cryptographic device authentication.';
      return this.toResponse(await this.save(session, `host_key_confirmed_${trustMethod}`));
    });
  }

  async list(limit = 50, offset = 0): Promise<CommissioningSessionResponse[]> {
    const take = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
    const skip = Number.isSafeInteger(offset) ? Math.max(offset, 0) : 0;
    const sessions = await this.sessions.find({ order: { updatedAt: 'DESC' }, take, skip });
    return sessions.map((session) => this.toResponse(session));
  }

  async verification(id: number) {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    const settings = this.readiness ? await this.wago.getSettings() : null;
    const runtime = this.readiness?.observe(session.mqttServerId, session.hardwareId, settings.operationalPrefix);
    const verification = await commissioningVerification(this.context, session, runtime);
    const security = session.managementControllerId
      ? await this.management.status(session.managementControllerId)
      : null;
    return {
      ...verification,
      enrollmentReady:
        verification.permanentConnection &&
        verification.enrollmentRevoked &&
        verification.configurationApplied &&
        verification.hardwareReadiness === 'ready',
      managementHardening: security?.hardened ? 'verified' : (security?.support ?? 'unverified'),
      softwareReady:
        verification.permanentConnection &&
        verification.enrollmentRevoked &&
        verification.configurationApplied &&
        verification.hardwareReadiness === 'ready' &&
        !!security?.hardened,
    };
  }

  /** Server-owned reconciliation continues even after the browser closes. */
  private async reconcileEnrollments(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      await this.reconcileDiscovery();
      for (let skip = 0; ; skip += 100) {
        const page = await this.sessions.find({ order: { id: 'ASC' }, take: 100, skip });
        for (const session of page) {
          if (session.state === 'awaiting_verification') await this.reconcileEnrollment(session.id);
        }
        if (page.length < 100) break;
      }
    } catch {
      this.context.logger?.warn('WAGO enrollment reconciliation will retry.');
    } finally {
      this.reconciling = false;
    }
  }

  private async reconcileEnrollment(id: number): Promise<void> {
    await this.withControllerLock(id, async () => {
      const session = await this.sessions.findOneBy({ id });
      if (!session || session.state !== 'awaiting_verification') return;
      const verification = await this.verification(id);
      if (!verification.controllerId || !verification.permanentConnection) return;
      await this.wago.ensureCommissioningConfiguration(verification.controllerId);
      if (!verification.enrollmentReady) return;
      session.state = 'completed';
      session.failureReason = null;
      session.pairingCode = null;
      await this.updateProgress(
        session,
        100,
        'Enrollment complete',
        'Permanent connection, bootstrap credential revocation, applied configuration and runtime hardware readiness verified. Physical qualification and management hardening are separate checks.',
      );
      await this.retireSupersededSessions(session.hardwareId, session.id);
    });
  }

  private async reconcileDiscovery(): Promise<void> {
    for (let skip = 0; ; skip += 100) {
      const page = await this.sessions.find({ order: { id: 'ASC' }, take: 100, skip });
      for (const session of page) {
        if (session.state !== 'awaiting_discovery' || session.enrollmentId === null) continue;
        const controller = await this.context.getRepository(WagoController).findOneBy({
          hardwareId: session.hardwareId,
          mqttServerId: session.mqttServerId,
          enrollmentId: session.enrollmentId,
        });
        if (controller?.trustState === 'untrusted') await this.claimDiscovered(controller);
      }
      if (page.length < 100) return;
    }
  }

  async platform(
    id: number,
    action: 'inspect' | 'activate' | 'recover',
    input: {
      temporarySsh?: TemporarySshCredential;
      reviewedDockerActivation?: boolean;
    },
    principal: CommissioningPrincipal | null = null,
  ): Promise<CommissioningSessionResponse> {
    if (action !== 'inspect' && input.reviewedDockerActivation !== true)
      throw new ConflictException('Explicit Docker activation or recovery approval is required.');
    return auditCommissioning(
      this.context,
      principal,
      id,
      `platform_${action}`,
      () =>
        this.withControllerLock(id, () =>
          this.withDeliveryLock(id, async () => {
            const session = await this.sessions.findOneBy({ id });
            if (!session) throw new NotFoundException('commissioning session not found');
            if (
              ['awaiting_identity_confirmation', 'delivering'].includes(session.state) ||
              (session.state === 'revoked' && action !== 'recover')
            )
              throw new ConflictException('Finish identity confirmation and any active delivery first.');
            if (action === 'activate' && session.dockerProvisionToken && session.dockerProvisionState !== 'started')
              throw new ConflictException('Clean up the retained controller preparation before retrying.');
            const credential = await this.sshCredential(session, input.temporarySsh);
            try {
              if (action === 'inspect') {
                session.platformReport = null;
                const report: WagoCommissioningPreflightReport = parseWagoHardwareDeploymentReport(
                  await this.sudoRunScript(
                    session.targetHost,
                    session.hostKeyFingerprint,
                    credential,
                    wagoHardwareDeploymentReportScript(),
                    { timeoutMs: 90_000, maxOutputBytes: 2048, readOnly: true },
                  ),
                );
                report.clock = await commissionClock(
                  (script, limits) =>
                    this.sudoRunScript(session.targetHost, session.hostKeyFingerprint, credential, script, limits),
                  false,
                  async () => undefined,
                );
                session.platformReport = JSON.stringify(report);
              } else if (action === 'activate') {
                const bundle = await this.acquireRuntimeBundle(session);
                try {
                  await this.prepareController(session, credential, bundle.bytes);
                } finally {
                  await rm(bundle.directory, { recursive: true, force: true });
                }
              } else {
                if (!session.dockerProvisionToken)
                  throw new ConflictException('No Docker provisioning attempt to recover.');
                await this.cleanupControllerPreparation(session, credential);
              }
              session.failureReason = null;
              return this.toResponse(await this.save(session, `platform_${action}_succeeded`));
            } catch (error) {
              if (error instanceof ConflictException) throw error;
              if (action !== 'inspect' && session.dockerProvisionToken)
                session.dockerProvisionState = 'recovery_required';
              session.failureReason = commissioningFailure(
                error,
                `${action === 'inspect' ? 'Inspecting controller prerequisites' : action === 'activate' ? 'Preparing controller' : 'Cleaning up controller preparation'} (${credential.username}@${session.targetHost})`,
              );
              return this.toResponse(await this.save(session, `platform_${action}_failed`));
            }
          }),
        ),
      (result) => !result.failureReason,
    );
  }

  private async cleanupControllerPreparation(
    session: WagoCommissioningSession,
    credential: TemporarySshCredential,
  ): Promise<void> {
    if (!session.dockerProvisionToken) return;
    if (session.dockerProvisionState !== 'restored') {
      session.dockerProvisionState = 'recovering';
      await this.save(session, 'controller_preparation_cleanup_started');
      try {
        await this.sudoRunScript(
          session.targetHost,
          session.hostKeyFingerprint,
          credential,
          wagoDockerProvisionRecoveryScript(session.dockerProvisionToken),
        );
      } catch (error) {
        if (
          !(error instanceof WagoCommissioningProcessError) ||
          error.diagnostic !== 'Docker provisioning token mismatch'
        )
          throw error;
        await this.sudoRunScript(
          session.targetHost,
          session.hostKeyFingerprint,
          credential,
          wagoDockerProvisionReconciliationScript(),
        );
        session.dockerProvisionToken = null;
        session.dockerProvisionState = null;
        await this.save(session, 'controller_preparation_reconciled');
        return;
      }
      session.dockerProvisionState = 'restored';
      await this.save(session, 'controller_preparation_cleanup_verified');
    }
    await this.sudoRunScript(
      session.targetHost,
      session.hostKeyFingerprint,
      credential,
      wagoDockerProvisionFinishScript(session.dockerProvisionToken, 'restored'),
    );
    session.dockerProvisionToken = null;
    session.dockerProvisionState = null;
    await this.save(session, 'controller_preparation_cleaned_up');
  }

  /**
   * A retry has the same explicit destructive-install approval as the attempt
   * that created this receipt. Retire a retained runtime transaction before
   * creating another one; requiring a separate recovery click only leaves the
   * retry permanently blocked after an interrupted delivery or a restart.
   */
  private async cleanupRetainedRuntimeDelivery(
    session: WagoCommissioningSession,
    credential: TemporarySshCredential,
  ): Promise<void> {
    if (!session.deliveryToken) return;
    const token = session.deliveryToken;
    await this.sudoRunScript(
      session.targetHost,
      session.hostKeyFingerprint,
      credential,
      runtimeBundleRecoveryScript('', token, 330),
    );
    await this.sudoRunScript(
      session.targetHost,
      session.hostKeyFingerprint,
      credential,
      runtimeBundleRecoveryAcknowledgementScript('', token),
    );
    await this.cleanupControllerPreparation(session, credential);
    await this.revokeSessionEnrollment(session);
    session.deliveryToken = null;
    session.enrollmentExpiresAt = null;
    await this.save(session, 'runtime_recovered_for_retry');
  }

  /** Finalize the durable controller-side receipts after a runtime has started. */
  private async acceptRetainedRuntimeDelivery(
    session: WagoCommissioningSession,
    credential: TemporarySshCredential,
  ): Promise<void> {
    if (!session.deliveryToken || !session.dockerProvisionToken)
      throw new ConflictException('The retained runtime installation has incomplete ownership metadata.');
    const token = session.deliveryToken;
    if (token !== session.dockerProvisionToken)
      throw new ConflictException('The retained runtime installation belongs to another controller preparation.');
    await this.sudoRunAfterControllerTransaction(
      session.targetHost,
      session.hostKeyFingerprint,
      credential,
      runtimeBundleAcceptScript(),
    );
    await this.sudoRunAfterControllerTransaction(
      session.targetHost,
      session.hostKeyFingerprint,
      credential,
      wagoDockerProvisionFinishScript(token, 'accepted'),
    );
    session.deliveryToken = null;
    session.dockerProvisionToken = null;
    session.dockerProvisionState = null;
  }

  /** The live runtime supervisor owns the same lock only while completing its bounded gate. */
  private async sudoRunAfterControllerTransaction(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    script: string,
  ): Promise<string> {
    // Both finalization scripts queue on flock with a 330s bound on the device.
    // Retrying entire SSH handshakes can repeatedly miss the supervisor's 2s
    // idle window. One queued waiter gets ownership as soon as the gate exits.
    return this.sudoRunScript(host, fingerprint, credential, script, {
      timeoutMs: 8 * 60_000,
      maxOutputBytes: 16_384,
    });
  }

  /** Persist ownership before destructive host changes so interruption is recoverable. */
  private async prepareController(
    session: WagoCommissioningSession,
    credential: TemporarySshCredential,
    verifiedBundleBytes: number,
  ): Promise<void> {
    if (session.deliveryToken)
      throw new ConflictException('Clean up the retained runtime installation before preparing the controller.');
    if (session.dockerProvisionToken && session.dockerProvisionState !== 'started')
      throw new ConflictException('Clean up the retained controller preparation before retrying.');
    await this.sudoRunScript(
      session.targetHost,
      session.hostKeyFingerprint,
      credential,
      runtimeBundleStagingCapacityPreflightScript(verifiedBundleBytes),
      { timeoutMs: 90_000, maxOutputBytes: 4096, readOnly: true },
    );
    session.dockerProvisionToken ??= randomBytes(16).toString('hex');
    session.dockerProvisionState = 'starting';
    await this.save(session, 'controller_preparation_started');
    try {
      await this.sudoRunScript(
        session.targetHost,
        session.hostKeyFingerprint,
        credential,
        wagoCommissioningPreparationScript(session.dockerProvisionToken),
      );
      session.dockerProvisionState = 'started';
      session.codesysState = 'disabled';
      await this.save(session, 'controller_prepared');
    } catch (error) {
      session.dockerProvisionState = 'recovery_required';
      await this.save(session, 'controller_preparation_failed');
      throw error;
    }
  }

  async managementStatus(id: number) {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    return session.managementControllerId ? this.management.status(session.managementControllerId) : null;
  }

  async operationStatus(id: number) {
    if (!(await this.sessions.findOneBy({ id }))) throw new NotFoundException('commissioning session not found');
    return { state: 'available' as const };
  }

  async recoverOperation(
    id: number,
    input: { temporarySsh?: TemporarySshCredential; previousWorkerStopped?: boolean; owner?: string },
    principal: CommissioningPrincipal | null = null,
  ) {
    return auditCommissioning(this.context, principal, id, 'lease_recover', () =>
      this.recoverOperationWhileAudited(id, input),
    );
  }

  private async recoverOperationWhileAudited(
    id: number,
    _input: { temporarySsh?: TemporarySshCredential; previousWorkerStopped?: boolean; owner?: string },
  ) {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    return { state: 'available' as const };
  }

  async manageSecurity(
    id: number,
    action: 'inspect' | 'review' | 'apply' | 'recover',
    input: {
      temporarySsh?: TemporarySshCredential;
      mode?: ManagementMode;
      exceptions?: ManagementException[];
      reviewToken?: string;
      confirm?: boolean;
    },
    principal: CommissioningPrincipal | null = null,
  ) {
    return auditCommissioning(
      this.context,
      principal,
      id,
      `security_${action}`,
      () => this.manageSecurityWhileAudited(id, action, input),
      (result) => !result.failure,
    );
  }

  private async manageSecurityWhileAudited(
    id: number,
    action: 'inspect' | 'review' | 'apply' | 'recover',
    input: {
      temporarySsh?: TemporarySshCredential;
      mode?: ManagementMode;
      exceptions?: ManagementException[];
      reviewToken?: string;
      confirm?: boolean;
    },
  ) {
    return this.withControllerLock(id, () =>
      this.withDeliveryLock(id, async () => {
        const session = await this.sessions.findOneBy({ id });
        if (!session) throw new NotFoundException('commissioning session not found');
        if (
          ['awaiting_identity_confirmation', 'delivering'].includes(session.state) ||
          (session.state === 'revoked' && action !== 'recover')
        )
          throw new ConflictException('Confirm controller identity and finish delivery before management changes.');
        if (!session.managementControllerId) {
          const controller = await this.context
            .getRepository(WagoController)
            .findOneBy({ hardwareId: session.hardwareId, mqttServerId: session.mqttServerId });
          if (!controller) throw new ConflictException('Wait for controller enrollment before management inspection.');
          session.managementControllerId = controller.id;
          await this.save(session, 'management_subject_bound');
        }
        const subject = session.managementControllerId;
        try {
          if (action === 'inspect')
            return await this.management.inspect(
              { controllerId: subject, host: session.targetHost, hostKeyFingerprint: session.hostKeyFingerprint },
              input.temporarySsh,
              this.operationContext.getStore()?.assertOwned,
            );
          if (action === 'review')
            return await this.management.review(
              subject,
              { mode: input.mode, exceptions: input.exceptions },
              this.operationContext.getStore()?.assertOwned,
            );
          if (action === 'apply')
            return await this.management.apply(
              subject,
              {
                reviewToken: input.reviewToken,
                confirm: input.confirm as true,
                temporarySsh: input.temporarySsh,
              },
              this.operationContext.getStore()?.assertOwned,
            );
          return await this.management.recover(
            subject,
            {
              confirm: input.confirm as true,
              temporarySsh: input.temporarySsh,
            },
            this.operationContext.getStore()?.assertOwned,
          );
        } catch (error) {
          throw new ConflictException(
            error instanceof ManagementError
              ? `Management security: ${error.code}`
              : 'Management security request failed.',
          );
        }
      }),
    );
  }

  private async verifyManagementKey(
    target: ManagementTarget,
    username: string,
    privateKey: string,
    nonce: string,
    limits: { timeoutMs: number; maxOutputBytes: number },
  ) {
    const guard = this.operationContext.getStore();
    await guard?.assertOwned();
    if (!/^[a-f0-9]{32}$/.test(nonce) || !/^[a-z_][a-z0-9_-]{0,31}$/.test(username))
      throw new Error('Invalid management proof');
    const directory = await mkdtemp(join(tmpdir(), 'attraccess-management-key-'));
    try {
      const knownHosts = join(directory, 'known_hosts'),
        key = join(directory, 'identity.pub');
      const identity = restoreManagementKey(privateKey);
      await writeFile(knownHosts, await pinnedHostKey(target.host, target.hostKeyFingerprint), { mode: 0o600 });
      await writeFile(key, identity.publicKey, { mode: 0o600 });
      const keyFingerprint = identity.fingerprint;
      const socket = join(directory, 'agent.sock');
      const sshArguments = [
        '-F',
        '/dev/null',
        '-i',
        key,
        '-o',
        `IdentityAgent=${socket}`,
        '-o',
        'IdentitiesOnly=yes',
        '-o',
        'PreferredAuthentications=publickey',
        '-o',
        'PasswordAuthentication=no',
        '-o',
        'KbdInteractiveAuthentication=no',
        '-o',
        'BatchMode=yes',
        '-o',
        'ControlPath=none',
        '-o',
        'GlobalKnownHostsFile=/dev/null',
        '-o',
        `UserKnownHostsFile=${knownHosts}`,
        '-o',
        'StrictHostKeyChecking=yes',
        '-o',
        'HostKeyAlgorithms=ssh-ed25519',
        '-o',
        'ConnectTimeout=15',
        `${username}@${target.host}`,
        `printf '%s\\n' ${shellQuote(nonce)}; id -u`,
      ];
      // A dedicated short-lived agent holds only this generated identity. The key
      // enters via stdin, never argv or a disk file; the agent exits with SSH and
      // its 30-second key TTL also bounds credentials after a client crash.
      const output = await this.remoteOperation(() =>
        runProcess(
          'ssh-agent',
          [
            '-t',
            '30',
            '-a',
            socket,
            'sh',
            '-c',
            `ssh-add -t 30 - >/dev/null 2>&1 && exec ssh ${sshArguments.map(shellQuote).join(' ')}`,
          ],
          privateKey,
          {},
          { ...limits, signal: guard?.signal },
        ),
      );
      const match = output.match(new RegExp(`^${nonce}\\n([0-9]+)\\n$`));
      if (!match) throw new Error('Management key proof failed');
      return {
        nonce,
        hostKeyFingerprint: target.hostKeyFingerprint,
        keyFingerprint,
        keyOnly: true,
        uid: Number(match[1]),
        managementOperationSucceeded: true,
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async deliver(
    id: number,
    input: DeliveryInput = {},
    principal: CommissioningPrincipal | null = null,
  ): Promise<CommissioningSessionResponse> {
    const result = await auditCommissioning(
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
    if (result.state === 'awaiting_discovery') {
      // Discovery is retained before delivery completes. Revisit it AFTER
      // releasing the installation lock; the one-shot MQTT callback may already
      // have run while the session was still delivering.
      await this.reconcileDiscovery();
      const session = await this.sessions.findOneBy({ id });
      if (!session) throw new NotFoundException('commissioning session not found');
      return this.toResponse(session);
    }
    return result;
  }

  private async deliverWhileLocked(
    id: number,
    input: DeliveryInput,
    principal: CommissioningPrincipal | null = null,
  ): Promise<CommissioningSessionResponse> {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    if (
      !['awaiting_delivery', 'delivering', 'awaiting_codesys_confirmation', 'delivery_failed'].includes(session.state)
    )
      throw new ConflictException('commissioning session cannot be delivered in its current state');
    const credential = await this.deliveryCredential(session, input);
    if (principal) session.initiatingPrincipal = JSON.stringify(principal);
    if (!session.runtimeArtifactDigest || !this.artifacts)
      throw new ConflictException('The bundled CC100 runtime is unavailable.');

    let pairingCode: string;
    try {
      pairingCode = this.decryptVerifier(session);
    } catch {
      await this.invalidateVerifier(session);
      return this.toResponse(session);
    }
    let enrollmentExpiresAt: string | null = null;
    let credentialsTouched = false;
    let bundle: Awaited<ReturnType<WagoRuntimeArtifactsService['acquire']>> | undefined;
    let failureStage = 'Checking MQTT broker configuration';
    let safeFailure = 'The selected MQTT server no longer exists.';

    try {
      session.state = 'delivering';
      session.failureReason = null;
      await this.updateProgress(
        session,
        5,
        'Preparing enrollment',
        session.deliveryToken || session.dockerProvisionToken
          ? 'Automatically reconciling the previous attempt before continuing.'
          : 'Checking the runtime release and MQTT credential provider.',
      );
      const broker = await this.context.getMqttServerConfig(session.mqttServerId);
      if (!broker) throw new ConflictException(safeFailure);
      try {
        assertCommissioningBroker(broker);
      } catch (error) {
        if (error instanceof ConflictException) safeFailure = error.message;
        throw error;
      }
      failureStage = 'Checking MQTT credential provisioning';
      const providers = await this.context.getMqttCredentialProvisioning().availableProviders(session.mqttServerId);
      if (!providers.length) {
        safeFailure =
          'No installed MQTT credential provider is available for the selected broker. The broker plugin did not report a reason; automatic enrollment cannot proceed.';
        throw new Error(safeFailure);
      }
      failureStage = 'Verifying bundled runtime';
      bundle = await this.acquireRuntimeBundle(session);
      // Startup recovery revokes the interrupted attempt's bootstrap identity.
      // A still-running container cannot resume enrollment with that identity.
      if (session.deliveryToken && session.enrollmentId === null) {
        failureStage = 'Cleaning up interrupted runtime';
        await this.cleanupRetainedRuntimeDelivery(session, credential);
      }
      // A retry has the same explicit destructive-install approval as the
      // attempt that created this retained preparation. Contain and retire it
      // before starting a new preparation; otherwise every retry is blocked
      // behind an avoidable, separate UI operation.
      if (session.deliveryToken) {
        failureStage = 'Reconciling transferred runtime';
        safeFailure = 'The transferred runtime could not be finalized automatically.';
        try {
          await this.acceptRetainedRuntimeDelivery(session, credential);
          session.state = 'awaiting_discovery';
          session.failureReason = null;
          session.progressPercent = 85;
          session.progressStep = 'Waiting for controller connection';
          session.progressDetail =
            'Runtime transfer was finalized after interruption. Waiting for the controller to connect.';
          return this.toResponse(await this.save(session, 'runtime_delivery_reconciled'));
        } catch (error) {
          // A host restart can leave the coordinator's durable token behind after
          // the controller has already discarded its runtime transaction. Its
          // stopped runtime and still-active preparation must be contained before
          // a retry creates a new transaction; accepting a non-existent receipt
          // can never make the controller connect.
          if (
            !(error instanceof WagoCommissioningProcessError) ||
            !['No started runtime transaction to accept', 'Runtime container is not running'].includes(error.diagnostic)
          )
            throw error;
          safeFailure = 'The orphaned controller preparation could not be cleaned up automatically.';
          // A transfer receipt can remain even after the transaction directory
          // disappeared. Retire that receipt before Docker containment: the
          // preparation lock deliberately refuses to run while it exists.
          await this.cleanupRetainedRuntimeDelivery(session, credential);
        }
      }
      if (session.dockerProvisionToken) {
        failureStage = 'Cleaning up failed controller preparation';
        safeFailure = 'The previous controller preparation could not be cleaned up automatically.';
        await this.cleanupControllerPreparation(session, credential);
      }
      session.state = 'delivering';
      session.failureReason = null;
      await this.updateProgress(
        session,
        10,
        'Verifying controller identity',
        'Checking pinned identity and runtime prerequisites.',
      );
      failureStage = `Checking controller identity and SSH access (${credential.username}@${session.targetHost})`;
      const inspection = await this.inspect(session.targetHost, session.hostKeyFingerprint, credential, true);
      session.codesysState = inspection.codesys;
      if (!isSupportedController(inspection.firmware, session.firmwareBaseline)) {
        safeFailure = 'Unsupported CC100 model or firmware baseline.';
        throw new Error(safeFailure);
      }
      if (inspection.platformReport) {
        session.platformReport = JSON.stringify(inspection.platformReport);
        await this.save(session, 'controller_prerequisites_inspected');
        const blockers = controllerPreparationBlockers(inspection.platformReport);
        if (blockers.length) {
          safeFailure = `Controller prerequisites: ${blockers.join(' ')}`;
          throw new Error(safeFailure);
        }
      }
      failureStage = 'Preparing controller';
      await this.updateProgress(
        session,
        20,
        'Preparing controller',
        'Permanently disabling CODESYS, activating vendor Docker and preparing exclusive onboard IO.',
      );
      safeFailure =
        'Controller preparation failed. Check staging storage and required tools. CODESYS must be stopped and permanently disabled before IO or runtime startup. Clean up any retained preparation attempt before retrying.';
      await this.prepareController(session, credential, bundle.bytes);
      failureStage = 'Checking runtime prerequisites';
      safeFailure =
        'Runtime prerequisites failed. Check vendor Docker, exclusive onboard IO, available storage and required firmware tools.';
      await this.sudoRunScript(
        session.targetHost,
        session.hostKeyFingerprint,
        credential,
        runtimeBundlePreflightScript(bundle.bytes),
      );
      await this.sudoRunScript(
        session.targetHost,
        session.hostKeyFingerprint,
        credential,
        'set -eu; if test -f /etc/attraccess-wago/install.lock; then (exec 8</etc/attraccess-wago/install.lock; flock -n 8) || { echo "Runtime lock is busy" >&2; exit 1; }; fi; for path in /etc/attraccess-wago/delivery /var/lib/attraccess-wago-install-transaction /var/lib/attraccess-wago-install-transaction.restored /var/lib/attraccess-wago-install-transaction.cleanup /var/lib/attraccess-wago-install-transaction.accepted-cleanup; do test ! -e "$path" || { echo "Retained runtime installation requires cleanup" >&2; exit 1; }; done',
      );
      failureStage = 'Checking controller UTC';
      safeFailure =
        'Controller UTC inspection or synchronization failed. Enrollment is blocked; retry with fresh install consent and SSH credentials. Check the application UTC clock and supported FW31 clock tool. Clock changes are not rolled back by cleanup.';
      const previousReport: WagoCommissioningPreflightReport = JSON.parse(session.platformReport ?? '{}');
      delete previousReport.clock;
      session.platformReport = JSON.stringify(previousReport);
      await this.updateProgress(
        session,
        45,
        'Checking controller UTC',
        'Comparing controller UTC with authoritative application UTC before enrollment.',
      );
      const clock = await commissionClock(
        (script, limits) =>
          this.sudoRunScript(session.targetHost, session.hostKeyFingerprint, credential, script, limits),
        input.confirmInstall === true,
        async (clock) => {
          session.platformReport = JSON.stringify({ ...JSON.parse(session.platformReport ?? '{}'), clock });
          await this.updateProgress(
            session,
            45,
            'Controller UTC',
            `${clock.result}; controller ${clock.controllerUtc}; application ${clock.hostUtc}; skew ${clock.skewSeconds}s; action ${clock.action}.`,
          );
        },
      );
      if (!['within-tolerance', 'synchronized'].includes(clock.result)) throw new Error(safeFailure);
      credentialsTouched = true;
      failureStage = 'Issuing MQTT enrollment';
      safeFailure =
        'Secure enrollment or runtime delivery failed. Clean up the retained installation before retrying; previous workloads will not be restored.';
      await this.revokeSessionEnrollment(session);
      await this.operationContext.getStore()?.assertOwned();
      safeFailure =
        'Application UTC changed or controller clock verification expired before enrollment. No new enrollment credential was issued; retry with fresh install consent.';
      clock.assertFresh();
      safeFailure =
        'Secure enrollment or runtime delivery failed. Clean up the retained installation before retrying; previous workloads will not be restored.';
      const enrollment = await this.wago.createEnrollment(
        session.hardwareId,
        session.mqttServerId,
        undefined,
        this.operationContext.getStore()?.assertOwned,
      );
      session.enrollmentId = enrollment.id;
      await this.save(session, 'enrollment_created');
      if (!enrollment.password) throw new Error('Restricted credential unavailable');
      // Re-resolve trust settings supplied by the host, never infer them from the enrollment DTO.
      const currentBroker = await this.context.getMqttServerConfig(session.mqttServerId);
      if (!currentBroker) throw new Error('Broker unavailable');
      assertCommissioningBroker(currentBroker);
      if (JSON.stringify(currentBroker) !== JSON.stringify(broker)) throw new Error('Broker changed during delivery');
      enrollmentExpiresAt = enrollment.expiresAt;
      const environment = [
        `WAGO_HARDWARE_ID=${session.hardwareId}`,
        `WAGO_MQTT_URL=${broker.useTls ? 'mqtts' : 'mqtt'}://${broker.host}:${broker.port}`,
        `WAGO_MQTT_USERNAME=${enrollment.username}`,
        `WAGO_MQTT_PASSWORD=${enrollment.password}`,
        `WAGO_ENROLLMENT_SECRET=${enrollment.claimSecret}`,
        `WAGO_PAIRING_CODE=${pairingCode}`,
        ...(broker.tlsInsecure ? ['WAGO_MQTT_TLS_INSECURE=true'] : []),
        ...(broker.tlsServername ? [`WAGO_MQTT_TLS_SERVERNAME=${broker.tlsServername}`] : []),
        ...(broker.caCert ? ['NODE_EXTRA_CA_CERTS=/var/lib/attraccess-wago/mqtt-ca.pem'] : []),
      ];
      if (environment.some((line) => /[\r\n\0]/.test(line))) throw new Error('Invalid environment value');
      await this.updateProgress(
        session,
        55,
        'Transferring runtime',
        'One locked delivery stages configuration and installs the signed runtime.',
      );
      failureStage = 'Transferring runtime';
      const deliveryToken = session.deliveryToken ?? session.dockerProvisionToken ?? randomBytes(16).toString('hex');
      session.deliveryToken = deliveryToken;
      await this.save(session, 'runtime_delivery_started');
      try {
        await this.copyTo(
          session.targetHost,
          session.hostKeyFingerprint,
          credential,
          bundle.path,
          runtimeBundleDeliveryScript(
            bundle.image,
            environment.join('\n'),
            broker.caCert,
            bundle.bytes,
            bundle.digest,
            deliveryToken,
          ),
          (percent, phase) => this.reportTransferProgress(session, percent, phase),
        );
      } finally {
        await this.transferWrites.get(session.id);
      }
      failureStage = 'Finalizing transferred runtime';
      safeFailure = 'The transferred runtime started but could not be finalized automatically.';
      await this.updateProgress(
        session,
        80,
        'Finalizing runtime',
        'The runtime supervisor passed its startup checks. Finalizing controller installation receipts.',
      );
      await this.acceptRetainedRuntimeDelivery(session, credential);
      failureStage = 'Waiting for controller discovery';
      session.state = 'awaiting_discovery';
      session.enrollmentExpiresAt = enrollmentExpiresAt;
      session.failureReason = null;
      session.progressPercent = 85;
      session.progressStep = 'Waiting for controller connection';
      session.progressDetail =
        'Runtime delivered. Waiting for the controller to connect and complete its automatic claim.';
      return this.toResponse(await this.save(session, 'bootstrap_delivered'));
    } catch (error) {
      if (error instanceof WagoRuntimeUploadError) safeFailure = error.message;
      else if (!(error instanceof Error && error.message === safeFailure))
        safeFailure = commissioningFailure(error, failureStage);
      if (credentialsTouched && session.enrollmentId !== null) {
        try {
          await this.revokeSessionEnrollment(session);
        } catch {
          session.state = 'delivery_failed';
          session.enrollmentExpiresAt = null;
          session.progressStep = 'Delivery failed';
          session.progressDetail = 'Credential revocation requires attention before delivery can be retried.';
          session.failureReason = `${safeFailure} Bootstrap credential revocation also failed; resolve revocation before retrying.`;
          return this.toResponse(await this.save(session, 'enrollment_revocation_failed'));
        }
      }
      session.state = 'delivery_failed';
      if (session.dockerProvisionToken && session.dockerProvisionState === 'recovering')
        session.dockerProvisionState = 'recovery_required';
      session.enrollmentExpiresAt = null;
      session.progressStep = 'Delivery failed';
      session.progressDetail =
        session.deliveryToken || session.dockerProvisionToken
          ? 'Retry will automatically reconcile and clean up this attempt before continuing. Previous workloads are not restored.'
          : 'Resolve the reported failure and retry installation. Controller preparation has not started.';
      session.failureReason = safeFailure;
      return this.toResponse(await this.save(session, 'delivery_failed'));
    } finally {
      if (bundle) await rm(bundle.directory, { recursive: true, force: true });
    }
  }

  private async acquireRuntimeBundle(
    session: WagoCommissioningSession,
  ): Promise<Awaited<ReturnType<WagoRuntimeArtifactsService['acquire']>>> {
    if (!this.artifacts) throw new ConflictException('The bundled CC100 runtime is unavailable.');
    const bundle = await this.artifacts.acquire(session.runtimeArtifactDigest ?? undefined);
    try {
      if (session.runtimeArtifactDigest && session.runtimeArtifactDigest !== bundle.digest)
        throw new ConflictException('Verified runtime release does not match the session-pinned artifact.');
      if ('image' in bundle && bundle.image && !session.runtimeArtifactDigest) {
        session.runtimeArtifactDigest = bundle.digest;
        await this.save(session, 'runtime_release_selected');
      }
      return bundle;
    } catch (error) {
      await rm(bundle.directory, { recursive: true, force: true });
      throw error;
    }
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

  private async recoverWhileAudited(id: number, input: DeliveryInput): Promise<CommissioningSessionResponse> {
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
        const credential = await this.deliveryCredential(session, input);
        const requiresNewSession =
          !session.pairingCode || ['claim_interrupted', 'awaiting_verification'].includes(session.state);
        if (!session.deliveryToken)
          throw new ConflictException('commissioning session has no runtime recovery ownership token');
        let restored = session.state === 'recovery_revocation_pending';
        try {
          // Cleanup must remain available even when the broker is unavailable.
          // Destructive commissioning never promises restoration of old workloads.
          if (!restored)
            await this.sudoRunScript(
              session.targetHost,
              session.hostKeyFingerprint,
              credential,
              runtimeBundleRecoveryScript('', session.deliveryToken),
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
          );
          await this.cleanupControllerPreparation(session, credential);
          await this.revokeSessionEnrollment(session);
          session.state = session.pairingCode ? 'delivery_failed' : 'revoked';
          session.deliveryToken = null;
          return this.toResponse(await this.save(session, 'runtime_recovered'));
        } catch {
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
            'Installation cleanup or credential revocation failed; finish the retained recovery before retrying delivery.';
          return this.toResponse(await this.save(session, 'runtime_recovery_failed'));
        }
      }),
    );
  }

  private async withControllerLock<T>(id: number, operation: () => Promise<T>): Promise<T> {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    const key = session.hostKeyFingerprint || session.targetHost;
    const previous = this.controllerLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => (release = resolve));
    const queued = previous.then(() => current);
    this.controllerLocks.set(key, queued);
    await previous;
    const controller = new AbortController();
    try {
      return await this.operationContext.run(
        {
          signal: controller.signal,
          deadline: Date.now() + SSH_TIMEOUT_MS,
          assertOwned: async () => {
            if (controller.signal.aborted) throw new ConflictException('Controller operation ended');
          },
        },
        operation,
      );
    } finally {
      controller.abort();
      release();
      if (this.controllerLocks.get(key) === queued) this.controllerLocks.delete(key);
    }
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

  async remove(id: number): Promise<void> {
    await this.withControllerLock(id, () =>
      this.withDeliveryLock(id, async () => {
        const session = await this.sessions.findOneBy({ id });
        if (!session) throw new NotFoundException('commissioning session not found');
        if (session.deliveryToken)
          throw new ConflictException('Clean up the retained runtime installation before deleting this session.');
        if (session.dockerProvisionToken)
          throw new ConflictException('Clean up the retained controller preparation before deleting this session.');
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

  async removeByHardwareId(hardwareId: string): Promise<void> {
    const sessions = await this.sessions.find({ where: { hardwareId } });
    await Promise.all(sessions.map((session) => this.remove(session.id)));
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
      const hardwareId = await remove(assertOwned);
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
          if (session.deliveryToken || session.dockerProvisionToken || session.managementControllerId) {
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
        current.progressPercent = 90;
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
          current.progressPercent = 95;
          current.pairingCode = null;
          current.failureReason = null;
          current.progressStep = 'Verifying commissioned controller';
          current.progressDetail =
            'Automatically verifying permanent credentials, heartbeat, applied configuration and runtime readiness.';
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

  private async inspect(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    includePrerequisites = false,
  ): Promise<{ firmware: string; codesys: string; platformReport?: WagoCommissioningPreflightReport }> {
    const output = await this.sudoRunScript(
      host,
      fingerprint,
      credential,
      `${wagoFw31IdentityRead()}; root=''; ${wagoCodesysClassificationShell()}\nprintf '\\nCODESYS='; wago_codesys_classify`,
      { timeoutMs: 90_000, maxOutputBytes: 65_536, readOnly: true },
    );
    const marker = '\nCODESYS=';
    const markerIndex = output.indexOf(marker);
    const firmware = markerIndex >= 0 ? output.slice(0, markerIndex) : output;
    const processes = markerIndex >= 0 ? output.slice(markerIndex + marker.length) : '';
    return {
      firmware,
      codesys: markerIndex < 0 ? 'unknown' : parseWagoCodesysClassification(processes),
      ...(includePrerequisites
        ? {
            platformReport: parseWagoHardwareDeploymentReport(
              await this.sudoRunScript(host, fingerprint, credential, wagoHardwareDeploymentReportScript(), {
                timeoutMs: 90_000,
                maxOutputBytes: 2048,
                readOnly: true,
              }),
            ),
          }
        : {}),
    };
  }

  private sudoRun(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    command: string,
    input?: string,
    limits?: SshCommandLimits,
  ): Promise<string> {
    if (credential.username === 'root') return this.run(host, fingerprint, credential, command, input, limits);
    return this.run(
      host,
      fingerprint,
      credential,
      `sudo -S sh -c ${shellQuote(command)}`,
      `${credential.password}\n${input ?? ''}`,
      limits,
    );
  }

  private sudoRunScript(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    script: string,
    limits?: SshCommandLimits,
  ): Promise<string> {
    return this.sudoRun(
      host,
      fingerprint,
      credential,
      'base64 -d | sh',
      Buffer.from(script).toString('base64'),
      limits,
    );
  }

  private async remoteOperation<T>(operation: () => Promise<T>, readOnly = false): Promise<T> {
    const guard = this.operationContext.getStore();
    await guard?.assertOwned();
    try {
      return await operation();
    } catch (error) {
      // A local transport rejection cannot establish remote termination, even
      // when a domain handler saves a failure response or attempts recovery.
      if (guard && !readOnly) this.uncertainRemoteOperations.add(guard);
      throw error;
    }
  }

  private async run(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    command: string,
    input?: string,
    limits?: SshCommandLimits,
  ): Promise<string> {
    const guard = this.operationContext.getStore();
    await guard?.assertOwned();
    const dir = await mkdtemp(join(tmpdir(), 'attraccess-cc100-'));
    const knownHosts = join(dir, 'known_hosts');
    const askPass = join(dir, 'askpass');
    const peer = command === MANAGEMENT_INSPECTION_COMMAND ? new ManagementPeerVersion() : undefined;
    try {
      await writeFile(knownHosts, await pinnedHostKey(host, fingerprint), { mode: 0o600 });
      await writeFile(askPass, '#!/bin/sh\nprintf \'%s\\n\' "$ATTRACCESS_SSH_PASSWORD"\n', { mode: 0o700 });
      const output = await this.remoteOperation(
        () =>
          runProcess(
            'ssh',
            [
              ...BOOTSTRAP_SSH_OPTIONS,
              ...(peer ? ['-v'] : []),
              '-o',
              'BatchMode=no',
              '-o',
              'NumberOfPasswordPrompts=1',
              '-o',
              'HostKeyAlgorithms=ssh-ed25519',
              '-o',
              'StrictHostKeyChecking=yes',
              '-o',
              `UserKnownHostsFile=${knownHosts}`,
              '-o',
              'ConnectTimeout=15',
              `${credential.username}@${host}`,
              `sh -c ${shellQuote(command)}`,
            ],
            input,
            {
              SSH_ASKPASS: askPass,
              SSH_ASKPASS_REQUIRE: 'force',
              DISPLAY: 'attraccess',
              ATTRACCESS_SSH_PASSWORD: credential.password,
            },
            {
              timeoutMs: limits?.timeoutMs ?? SSH_TIMEOUT_MS,
              maxOutputBytes: limits?.maxOutputBytes ?? 65_536,
              signal: guard?.signal,
              peerVersion: peer,
            },
          ),
        limits?.readOnly,
      );
      // -v's identification belongs to this authenticated, pinned SSH session.
      // Root /proc executable access is unnecessary for a non-root account.
      return peer ? output.replace(/\nEND=1\n$/, `\nDROPBEAR=${peer.result()}\nEND=1\n`) : output;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async copyTo(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    source: string,
    script: string,
    onProgress: RuntimeDeliveryProgress,
  ): Promise<void> {
    const guard = this.operationContext.getStore();
    await guard?.assertOwned();
    const dir = await mkdtemp(join(tmpdir(), 'attraccess-cc100-'));
    const knownHosts = join(dir, 'known_hosts');
    const askPass = join(dir, 'askpass');
    try {
      await writeFile(knownHosts, await pinnedHostKey(host, fingerprint), { mode: 0o600 });
      await writeFile(askPass, '#!/bin/sh\nprintf \'%s\\n\' "$ATTRACCESS_SSH_PASSWORD"\n', { mode: 0o700 });
      // Keep the credential-bearing script off the API host's process arguments.
      // read consumes one line; the installer receives the remaining binary stream.
      const receiver = runtimeBundleStreamReceiver;
      await this.remoteOperation(() =>
        uploadFile(
          source,
          [
            ...BOOTSTRAP_SSH_OPTIONS,
            '-o',
            'BatchMode=no',
            '-o',
            'NumberOfPasswordPrompts=1',
            '-o',
            'HostKeyAlgorithms=ssh-ed25519',
            '-o',
            'StrictHostKeyChecking=yes',
            '-o',
            `UserKnownHostsFile=${knownHosts}`,
            '-o',
            'ConnectTimeout=15',
            `${credential.username}@${host}`,
            credential.username === 'root' ? `sh -c ${shellQuote(receiver)}` : `sudo -S sh -c ${shellQuote(receiver)}`,
          ],
          {
            SSH_ASKPASS: askPass,
            SSH_ASKPASS_REQUIRE: 'force',
            DISPLAY: 'attraccess',
            ATTRACCESS_SSH_PASSWORD: credential.password,
          },
          onProgress,
          `${credential.username === 'root' ? '' : `${credential.password}\n`}${Buffer.from(script).toString('base64')}\n`,
          guard?.signal,
        ),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async save(session: WagoCommissioningSession, event: string): Promise<WagoCommissioningSession> {
    await this.operationContext.getStore()?.assertOwned();
    const audit = JSON.parse(session.auditLog) as Array<{ at: string; event: string }>;
    audit.push({ at: new Date().toISOString(), event });
    session.auditLog = JSON.stringify(audit.slice(-50));
    session.updatedAt = new Date().toISOString();
    return this.sessions.save(session);
  }

  private async updateProgress(
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

  private reportTransferProgress(
    session: WagoCommissioningSession,
    percent: number,
    phase?: RuntimeDeliveryPhase,
  ): void {
    const stage = phase ? DELIVERY_PHASES[phase] : undefined;
    const progressPercent = stage?.[0] ?? 55 + Math.round((percent * 15) / 100);
    session.progressPercent = progressPercent;
    session.progressStep = stage?.[1] ?? (percent === 100 ? 'Finishing runtime transfer' : 'Transferring runtime');
    session.progressDetail =
      stage?.[2] ??
      (percent === 100
        ? 'All bytes queued. Waiting for the controller to confirm receipt and begin installation.'
        : `Uploading signed runtime bundle: ${percent}%.`);
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

  private encryptVerifier(plaintext: string): string {
    try {
      return VERIFIER_PREFIX + this.context.secrets.encrypt(plaintext);
    } catch {
      throw new ConflictException('Commissioning verifier encryption failed.');
    }
  }

  private decryptVerifier(session: WagoCommissioningSession): string {
    try {
      if (!session.pairingCode?.startsWith(VERIFIER_PREFIX)) throw new Error();
      const plaintext = this.context.secrets.decrypt(session.pairingCode.slice(VERIFIER_PREFIX.length));
      if (!/^[A-Za-z0-9_-]{43}$/.test(plaintext)) throw new Error();
      return plaintext;
    } catch {
      throw new ConflictException('Commissioning verifier is unavailable; create a new session.');
    }
  }

  private async revokeSessionEnrollment(session: WagoCommissioningSession): Promise<void> {
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

  private async invalidateVerifier(session: WagoCommissioningSession): Promise<void> {
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

  private async recoverSessions(): Promise<void> {
    let recoveryFailed = false;
    // Page the entire stable ID ordering: changing states must not skip rows.
    for (let skip = 0; ; skip += 100) {
      const page = await this.sessions.find({ order: { id: 'ASC' }, take: 100, skip });
      for (const candidate of page) {
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

  private async reconcileCompletedSessions(): Promise<void> {
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

  private async retireSupersededSessions(hardwareId: string, completedSessionId: number): Promise<void> {
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

  private toResponse(session: WagoCommissioningSession): CommissioningSessionResponse {
    const {
      pairingCode: _pairingCode,
      deliveryToken: _deliveryToken,
      initiatingPrincipal: _principal,
      dockerProvisionToken: _dockerToken,
      encryptedSshCredential: _encryptedSshCredential,
      ...response
    } = session;
    void _pairingCode;
    void _deliveryToken;
    void _principal;
    void _dockerToken;
    void _encryptedSshCredential;
    return { ...response, ...(_deliveryToken ? { runtimeRecoveryAvailable: true } : {}) };
  }

  private async deliveryCredential(
    session: WagoCommissioningSession,
    input: DeliveryInput,
  ): Promise<TemporarySshCredential> {
    requireDeliveryConfirmation(input);
    return this.sshCredential(session, input.temporarySsh);
  }

  private async sshCredential(
    session: WagoCommissioningSession,
    temporarySsh: TemporarySshCredential | undefined,
  ): Promise<TemporarySshCredential> {
    if (temporarySsh) {
      const credential = validateSshCredential(temporarySsh);
      await this.persistSshCredential(session, credential);
      return credential;
    }
    if (session.encryptedSshCredential) {
      try {
        return validateSshCredential(JSON.parse(this.context.secrets.decrypt(session.encryptedSshCredential)));
      } catch {
        throw new ConflictException(
          'The stored SSH credential is unavailable. Supply replacement SSH credentials to update it.',
        );
      }
    }
    if (session.encryptedSshCredential === null) {
      await this.persistSshCredential(session, FACTORY_SSH_CREDENTIAL);
      return FACTORY_SSH_CREDENTIAL;
    }
    // Lightweight unit-test repositories do not implement TypeORM's hidden-column query API.
    // Production repositories always do; an absent encrypted value is the factory baseline.
    if (typeof (this.sessions as { createQueryBuilder?: unknown }).createQueryBuilder !== 'function') {
      await this.persistSshCredential(session, FACTORY_SSH_CREDENTIAL);
      return FACTORY_SSH_CREDENTIAL;
    }
    const persisted = await this.sessions
      .createQueryBuilder('session')
      .addSelect('session.encryptedSshCredential')
      .where('session.id = :id', { id: session.id })
      .getOne();
    if (!persisted?.encryptedSshCredential) {
      await this.persistSshCredential(session, FACTORY_SSH_CREDENTIAL);
      return FACTORY_SSH_CREDENTIAL;
    }
    try {
      return validateSshCredential(JSON.parse(this.context.secrets.decrypt(persisted.encryptedSshCredential)));
    } catch {
      throw new ConflictException(
        'The stored SSH credential is unavailable. Supply replacement SSH credentials to update it.',
      );
    }
  }

  /** The selected credential is session-owned, encrypted at rest, and never returned by the API. */
  private async persistSshCredential(
    session: WagoCommissioningSession,
    credential: TemporarySshCredential,
  ): Promise<void> {
    const plaintext = JSON.stringify(credential);
    const encrypted = this.context.secrets.encrypt(plaintext);
    if (!encrypted || encrypted === plaintext) throw new Error('Secure SSH credential storage is unavailable.');
    session.encryptedSshCredential = encrypted;
    await this.save(session, 'ssh_credential_saved');
  }

  private async withDeliveryLock<T>(id: number, operation: () => Promise<T>): Promise<T> {
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
}

async function scanHostKey(host: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'attraccess-cc100-'));
  const knownHosts = join(dir, 'known_hosts');
  try {
    await writeFile(knownHosts, await scanHostKeys(host), { mode: 0o600 });
    return await fingerprintFor(knownHosts);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function scanHostKeys(host: string): Promise<string> {
  return runProcess('ssh-keyscan', ['-T', '15', '-t', 'ed25519', host]);
}

async function pinnedHostKey(host: string, expectedFingerprint: string): Promise<string> {
  const key = (await scanHostKeys(host)).split('\n').find((line) => line.includes('ssh-ed25519'));
  if (!key) throw new ConflictException('the controller did not provide an Ed25519 SSH host key');
  const dir = await mkdtemp(join(tmpdir(), 'attraccess-cc100-'));
  const knownHosts = join(dir, 'known_hosts');
  try {
    await writeFile(knownHosts, `${key}\n`, { mode: 0o600 });
    if ((await fingerprintFor(knownHosts)) !== expectedFingerprint)
      throw new ConflictException('controller SSH host key changed after automatic identity verification');
    return `${key}\n`;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function fingerprintFor(knownHosts: string): Promise<string> {
  const result = (await runProcess('ssh-keygen', ['-lf', knownHosts, '-E', 'sha256'])).match(
    /(SHA256:[A-Za-z0-9+/=]+)/,
  )?.[1];
  if (!result) throw new ConflictException('the controller did not provide a supported SSH host key');
  return result;
}

function runProcess(
  command: string,
  args: string[],
  input?: string | Buffer,
  environment?: Record<string, string>,
  limits: { timeoutMs: number; maxOutputBytes: number; signal?: AbortSignal; peerVersion?: ManagementPeerVersion } = {
    timeoutMs: SSH_TIMEOUT_MS,
    maxOutputBytes: 65_536,
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...environment }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const started = Date.now();
    let stopped = false;
    const abort = () => stop('operation-aborted');
    const stop = (termination: ProcessTermination) => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      limits.signal?.removeEventListener('abort', abort);
      child.kill();
      setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
      }, 1000).unref();
      reject(new WagoCommissioningProcessError(command, null, Date.now() - started, stderr, termination));
    };
    const timer = setTimeout(() => stop('local-timeout'), limits.timeoutMs);
    limits.signal?.addEventListener('abort', abort, { once: true });
    // A constrained controller may reject stdin before SSH exits; handle it without exposing process output.
    child.stdin.on('error', () => undefined);
    child.stdout.on('data', (chunk) => {
      if (stopped) return;
      if (Buffer.byteLength(stdout) + chunk.length > limits.maxOutputBytes) {
        stop('output-limit');
      } else stdout += chunk;
    });
    child.stderr.on('data', (chunk: Buffer) => {
      limits.peerVersion?.write(chunk);
      stderr = (stderr + chunk.toString()).slice(-8192);
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      limits.signal?.removeEventListener('abort', abort);
      stopped = true;
      reject(
        new WagoCommissioningProcessError(command, null, Date.now() - started, stderr, 'spawn-failed', error.code),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      limits.signal?.removeEventListener('abort', abort);
      if (stopped) return;
      stopped = true;
      if (code === 0) resolve(stdout);
      else reject(new WagoCommissioningProcessError(command, code, Date.now() - started, stderr));
    });
    if (limits.signal?.aborted) {
      abort();
      return;
    }
    child.stdin.end(input);
  });
}

/** Only fixed shell diagnostics cross the credential-bearing SSH boundary. */
export class WagoRuntimeUploadError extends Error {
  constructor(
    code: number | null,
    elapsedMs: number,
    stderr: string,
    termination: 'remote-exit' | 'local-timeout' | 'operation-aborted' = 'remote-exit',
  ) {
    const reason =
      controllerFailureDetail(stderr) ??
      new WagoCommissioningProcessError('ssh', code, elapsedMs, stderr, termination).diagnostic ??
      'No recognized remote diagnostic';
    super(
      `Runtime delivery failed: ${termination}, SSH exit ${code ?? 'unknown'}, ${Math.round(elapsedMs / 1000)}s elapsed. ${reason}. Use reviewed recovery before retrying.`,
    );
  }
}

async function uploadFile(
  source: string,
  args: string[],
  environment: Record<string, string>,
  onProgress: RuntimeDeliveryProgress,
  prefix?: string,
  signal?: AbortSignal,
): Promise<void> {
  const size = (await stat(source)).size;
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', args, { env: { ...process.env, ...environment }, stdio: ['pipe', 'ignore', 'pipe'] });
    const stream = createReadStream(source);
    let transferred = 0;
    let lastPercent = -1;
    let settled = false;
    const started = Date.now();
    let stderr = '';
    let phaseBuffer = '';
    let termination: 'remote-exit' | 'local-timeout' | 'operation-aborted' = 'remote-exit';
    const timer = setTimeout(() => {
      termination = 'local-timeout';
      child.kill();
    }, SSH_TIMEOUT_MS);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      stream.destroy();
      if (error)
        reject(
          error instanceof WagoRuntimeUploadError
            ? error
            : new WagoRuntimeUploadError(null, Date.now() - started, stderr, termination),
        );
      else resolve();
    };
    const abort = () => {
      termination = 'operation-aborted';
      child.kill();
      finish(new Error('Commissioning upload interrupted.'));
    };
    child.stdin.on('error', () => undefined);
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4096);
      phaseBuffer = (phaseBuffer + chunk.toString()).slice(-4096);
      let newline: number;
      while ((newline = phaseBuffer.indexOf('\n')) >= 0) {
        const line = phaseBuffer.slice(0, newline);
        phaseBuffer = phaseBuffer.slice(newline + 1);
        const phase = line.startsWith('WAGO_DELIVERY_PHASE=') ? line.slice('WAGO_DELIVERY_PHASE='.length) : '';
        if (Object.hasOwn(DELIVERY_PHASES, phase)) onProgress(100, phase as RuntimeDeliveryPhase);
      }
    });
    child.on('error', finish);
    child.on('close', (code) =>
      finish(code === 0 ? undefined : new WagoRuntimeUploadError(code, Date.now() - started, stderr, termination)),
    );
    stream.on('error', (error) => {
      child.kill();
      finish(error);
    });
    stream.on('data', (chunk: Buffer) => {
      transferred += chunk.length;
      const percent = size ? Math.floor((transferred * 100) / size) : 100;
      if (percent === 100 || percent - lastPercent >= 5) {
        lastPercent = percent;
        onProgress(percent);
      }
    });
    onProgress(0);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    if (prefix) child.stdin.write(prefix);
    stream.pipe(child.stdin);
  });
}

function isPrivateAddress(host: string): boolean {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  return (
    octets[0] === 10 ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
  );
}

export function isSupportedController(inspection: string, firmwareBaseline: string): boolean {
  return firmwareBaseline.trim() === '31' && isCc100Fw31Identity(inspection);
}

export function resolveRuntimeSigningPublicKeyPath(
  environment: string | undefined,
  localPath: string,
  releasePath: string,
): string {
  if (!localPath) return releasePath;
  if (environment !== 'development')
    throw new ConflictException('local CC100 runtime signing keys are only allowed in development');
  return localPath;
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function requireDeliveryConfirmation(input: DeliveryInput): void {
  if (input?.confirmInstall !== true)
    throw new ConflictException('explicit installation confirmation is required for every delivery attempt');
}

function validateSshCredential(credential: unknown): TemporarySshCredential {
  if (
    !credential ||
    typeof (credential as TemporarySshCredential).username !== 'string' ||
    !/^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/.test((credential as TemporarySshCredential).username) ||
    typeof (credential as TemporarySshCredential).password !== 'string' ||
    !(credential as TemporarySshCredential).password.trim() ||
    /[\r\n\0]/.test((credential as TemporarySshCredential).password)
  )
    throw new ConflictException('A valid custom SSH username and password are required.');
  return credential as TemporarySshCredential;
}
