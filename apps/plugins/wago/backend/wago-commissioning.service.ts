import { ConflictException, Inject, Injectable, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLUGIN_CONTEXT, PluginContext, Repository } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoService } from './wago.service';
import { commissioningVerification } from './wago-commissioning-verification';
import { WagoController } from './wago-controller.entity';
import { assertCommissioningBroker } from './wago-commissioning-preflight';
import {
  runtimeBundleDeliveryScript,
  runtimeBundlePreflightScript,
  runtimeBundleRecoveryAcknowledgementScript,
  runtimeBundleRecoveryScript,
  runtimeBundleStreamReceiver,
} from './wago-runtime-install';
export { runtimeBundleInstallScript } from './wago-runtime-install';

const SSH_TIMEOUT_MS = 30 * 60_000;
// The initial supported CC100 commissioning baseline. Operators may pin a more
// specific vendor firmware identifier through configuration as it becomes available.
const configuredFirmwareBaseline = process.env.WAGO_CC100_FIRMWARE_BASELINE?.trim() || '31';
const configuredRuntimeImage = process.env.WAGO_CC100_RUNTIME_IMAGE?.trim() ?? '';
const configuredRuntimeBundle = process.env.WAGO_CC100_RUNTIME_BUNDLE_PATH?.trim() ?? '';
const configuredRuntimeBundleChecksum = process.env.WAGO_CC100_RUNTIME_BUNDLE_SHA256_PATH?.trim() ?? '';
const configuredRuntimeBundleSignature = process.env.WAGO_CC100_RUNTIME_BUNDLE_SIGNATURE_PATH?.trim() ?? '';
const configuredRuntimeSigningPublicKey = process.env.WAGO_CC100_RUNTIME_SIGNING_PUBLIC_KEY_PATH?.trim() ?? '';
const SIGNING_NAMESPACE = 'attraccess-wago-runtime';
const SIGNING_IDENTITY = 'attraccess-wago-runtime';

type TemporarySshCredential = { username: string; password: string };
type CommissioningSessionResponse = Omit<WagoCommissioningSession, 'pairingCode' | 'deliveryToken'>;
const VERIFIER_PREFIX = 'encrypted:v1:';
type DeliveryInput = { temporarySsh?: TemporarySshCredential; confirmInstall?: boolean };

@Injectable()
export class WagoCommissioningService implements OnApplicationBootstrap {
  private sessions!: Repository<WagoCommissioningSession>;
  private readonly controllerLocks = new Map<string, Promise<void>>();
  private readonly deliveryLocks = new Map<number, Promise<void>>();

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(WagoService) private readonly wago: WagoService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // The host datasource is available only after plugin module construction completes.
    this.sessions = this.context.getRepository(WagoCommissioningSession);
    try {
      await this.recoverSessions();
      await this.reconcileCompletedSessions();
      this.wago.registerCommissioningDiscoveryHandler((controller) => this.claimDiscovered(controller));
      void this.reconcileDiscovery().catch(() =>
        this.context.logger?.warn('Saved commissioning discovery requires attention.'),
      );
    } catch {
      this.context.logger?.warn('WAGO commissioning recovery failed; automatic discovery claim is disabled.');
    }
  }

  support(): { firmwareBaseline: string | null; ready: boolean } {
    return {
      firmwareBaseline: configuredFirmwareBaseline || null,
      ready: Boolean(
        configuredFirmwareBaseline &&
        isImmutableImage(configuredRuntimeImage) &&
        configuredRuntimeBundle &&
        configuredRuntimeBundleChecksum &&
        configuredRuntimeBundleSignature,
      ),
    };
  }

  async create(input: {
    mqttServerId: number;
    targetHost: string;
    name: string;
  }): Promise<CommissioningSessionResponse> {
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

  async confirmHostKey(id: number, hostKeyFingerprint: string): Promise<CommissioningSessionResponse> {
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
      session.progressDetail = 'The administrator confirmed the controller SSH host key. Ready for secure delivery.';
      return this.toResponse(await this.save(session, 'host_key_confirmed'));
    });
  }

  async list(limit = 50, offset = 0): Promise<Array<Omit<WagoCommissioningSession, 'pairingCode'>>> {
    const take = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
    const skip = Number.isSafeInteger(offset) ? Math.max(offset, 0) : 0;
    const sessions = await this.sessions.find({ order: { updatedAt: 'DESC' }, take, skip });
    return sessions.map(
      (session) =>
        Object.fromEntries(Object.entries(session).filter(([field]) => field !== 'pairingCode')) as Omit<
          WagoCommissioningSession,
          'pairingCode'
        >,
    );
  }

  async verification(id: number) {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    return commissioningVerification(this.context, session);
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

  async deliver(id: number, input: DeliveryInput = {}): Promise<CommissioningSessionResponse> {
    return this.withDeliveryLock(id, () => this.withControllerLock(id, () => this.deliverWhileLocked(id, input)));
  }

  private async deliverWhileLocked(id: number, input: DeliveryInput): Promise<CommissioningSessionResponse> {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    if (
      !['awaiting_delivery', 'delivering', 'awaiting_codesys_confirmation', 'delivery_failed'].includes(session.state)
    )
      throw new ConflictException('commissioning session cannot be delivered in its current state');
    const credential = requireDeliveryCredentials(input);
    if (!isRuntimeArtifactConfigured())
      throw new ConflictException('no immutable, signed CC100 runtime bundle is configured for commissioning');

    let pairingCode: string;
    try {
      pairingCode = this.decryptVerifier(session);
    } catch {
      await this.invalidateVerifier(session);
      return this.toResponse(session);
    }
    let enrollmentExpiresAt: string | null = null;
    let credentialsTouched = false;
    let bundle: Awaited<ReturnType<typeof verifyRuntimeBundle>> | undefined;
    let safeFailure =
      'Secure delivery failed. Controller recovery may be required; check access and runtime prerequisites.';

    try {
      const broker = await this.context.getMqttServerConfig(session.mqttServerId);
      if (!broker) throw new ConflictException('MQTT server not found');
      try {
        assertCommissioningBroker(broker);
      } catch (error) {
        if (error instanceof ConflictException) safeFailure = error.message;
        throw error;
      }
      const providers = await this.context.getMqttCredentialProvisioning().availableProviders(session.mqttServerId);
      if (!providers.length) {
        safeFailure = 'Automatic MQTT credential provisioning is unavailable.';
        throw new Error(safeFailure);
      }
      bundle = await verifyRuntimeBundle();
      session.state = 'delivering';
      session.failureReason = null;
      await this.updateProgress(
        session,
        10,
        'Verifying controller identity',
        'Checking pinned identity and runtime prerequisites.',
      );
      const inspection = await this.inspect(session.targetHost, session.hostKeyFingerprint, credential);
      session.codesysState = inspection.codesys;
      if (!isSupportedController(inspection.firmware, session.firmwareBaseline)) {
        safeFailure = 'Unsupported CC100 model or firmware baseline.';
        throw new Error(safeFailure);
      }
      if (inspection.codesys !== 'inactive') {
        safeFailure =
          'CODESYS is active or unknown. Delivery blocked because workload configuration cannot be safely preserved and restored.';
        throw new Error(safeFailure);
      }
      await this.sudoRunScript(
        session.targetHost,
        session.hostKeyFingerprint,
        credential,
        runtimeBundlePreflightScript(bundle.bytes),
      );
      credentialsTouched = true;
      await this.revokeSessionEnrollment(session);
      const enrollment = await this.wago.createEnrollment(session.hardwareId, session.mqttServerId);
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
        `WAGO_MQTT_URL=mqtts://${broker.host}:${broker.port}`,
        `WAGO_MQTT_USERNAME=${enrollment.username}`,
        `WAGO_MQTT_PASSWORD=${enrollment.password}`,
        `WAGO_ENROLLMENT_SECRET=${enrollment.claimSecret}`,
        `WAGO_PAIRING_CODE=${pairingCode}`,
        ...(broker.caCert ? ['NODE_EXTRA_CA_CERTS=/var/lib/attraccess-wago/mqtt-ca.pem'] : []),
      ];
      if (environment.some((line) => /[\r\n\0]/.test(line))) throw new Error('Invalid environment value');
      await this.updateProgress(
        session,
        55,
        'Transferring runtime',
        'One locked delivery stages configuration and installs the signed runtime.',
      );
      const deliveryToken = session.deliveryToken ?? randomBytes(16).toString('hex');
      session.deliveryToken = deliveryToken;
      await this.save(session, 'runtime_delivery_started');
      await this.copyTo(
        session.targetHost,
        session.hostKeyFingerprint,
        credential,
        bundle.path,
        runtimeBundleDeliveryScript(
          configuredRuntimeImage,
          environment.join('\n'),
          broker.caCert,
          bundle.bytes,
          bundle.digest,
          deliveryToken,
        ),
        (percent) => this.reportTransferProgress(session, percent),
      );

      session.state = 'awaiting_discovery';
      session.enrollmentExpiresAt = enrollmentExpiresAt;
      session.failureReason = null;
      session.progressPercent = 100;
      session.progressStep = 'Waiting for controller connection';
      session.progressDetail =
        'Runtime delivered. Waiting for the controller to connect and complete its automatic claim.';
      return this.toResponse(await this.save(session, 'bootstrap_delivered'));
    } catch {
      if (credentialsTouched && session.enrollmentId !== null) {
        try {
          await this.revokeSessionEnrollment(session);
        } catch {
          session.state = 'delivery_failed';
          session.enrollmentExpiresAt = null;
          session.progressStep = 'Delivery failed';
          session.progressDetail = 'Credential revocation requires attention before delivery can be retried.';
          session.failureReason = 'Secure delivery failed; bootstrap credential revocation requires attention.';
          return this.toResponse(await this.save(session, 'enrollment_revocation_failed'));
        }
      }
      session.state = 'delivery_failed';
      session.enrollmentExpiresAt = null;
      session.progressStep = 'Delivery failed';
      session.progressDetail =
        'Review the blocker. If delivery was interrupted, explicitly recover the controller snapshot before retrying.';
      session.failureReason = safeFailure;
      return this.toResponse(await this.save(session, 'delivery_failed'));
    } finally {
      if (bundle) await rm(bundle.directory, { recursive: true, force: true });
    }
  }

  async recover(id: number, input: DeliveryInput = {}): Promise<CommissioningSessionResponse> {
    const credential = requireDeliveryCredentials(input);
    return this.withDeliveryLock(id, () =>
      this.withControllerLock(id, async () => {
        const session = await this.sessions.findOneBy({ id });
        if (!session) throw new NotFoundException('commissioning session not found');
        if (
          ![
            'delivery_failed',
            'awaiting_discovery',
            'awaiting_verification',
            'claim_interrupted',
            'recovery_revocation_pending',
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
          // Recovery restores the old environment verbatim. Broker availability must
          // not prevent restoring a controller; no new credentials are provisioned.
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
          session.progressStep = 'Runtime snapshot restored';
          session.progressDetail =
            'Previous container, environment and data restored. Readiness is unverified; restored broker credentials may have been revoked.';
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
            ? 'Runtime restored. Retry recovery to finish broker credential revocation; the controller will not be restored again.'
            : 'Recovery could not be confirmed. An active lock is never removed; retry explicit recovery after the active operation ends.';
          session.failureReason =
            'Runtime recovery or credential revocation failed; inspect the retained snapshot before retrying delivery.';
          return this.toResponse(await this.save(session, 'runtime_recovery_failed'));
        }
      }),
    );
  }

  private async withControllerLock<T>(id: number, operation: () => Promise<T>): Promise<T> {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    const key = session.hostKeyFingerprint || session.targetHost || session.hardwareId;
    const previous = this.controllerLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => (release = resolve));
    const queued = previous.then(() => current);
    this.controllerLocks.set(key, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.controllerLocks.get(key) === queued) this.controllerLocks.delete(key);
    }
  }

  async revoke(id: number): Promise<CommissioningSessionResponse> {
    return this.withDeliveryLock(id, async () => {
      const session = await this.sessions.findOneBy({ id });
      if (!session) throw new NotFoundException('commissioning session not found');
      await this.revokeSessionEnrollment(session);
      session.state = 'revoked';
      session.pairingCode = null;
      session.failureReason = null;
      return this.toResponse(await this.save(session, 'revoked'));
    });
  }

  async remove(id: number): Promise<void> {
    await this.withDeliveryLock(id, async () => {
      const session = await this.sessions.findOneBy({ id });
      if (!session) throw new NotFoundException('commissioning session not found');
      if (session.enrollmentId !== null) {
        try {
          await this.wago.revokeEnrollmentById(session.enrollmentId);
          await this.wago.deleteEnrollmentById(session.enrollmentId);
        } catch {
          throw new ConflictException('Commissioning enrollment removal failed.');
        }
      }
      await this.sessions.delete(id);
    });
  }

  async removeByHardwareId(hardwareId: string): Promise<void> {
    const sessions = await this.sessions.find({ where: { hardwareId } });
    await Promise.all(sessions.map((session) => this.remove(session.id)));
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

    await this.withDeliveryLock(session.id, async () => {
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
        await this.wago.claim(controller.id, current.controllerName, pairingCode, current.mqttServerId);
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
    });
  }

  private async inspect(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
  ): Promise<{ firmware: string; codesys: string }> {
    const output = await this.run(
      host,
      fingerprint,
      credential,
      "cat /etc/os-release; printf '\\nCODESYS='; ps -eo comm=",
    );
    const marker = '\nCODESYS=';
    const markerIndex = output.indexOf(marker);
    const firmware = markerIndex >= 0 ? output.slice(0, markerIndex) : output;
    const processes = markerIndex >= 0 ? output.slice(markerIndex + marker.length) : '';
    return { firmware, codesys: markerIndex < 0 ? 'unknown' : /codesys/i.test(processes) ? 'active' : 'inactive' };
  }

  private sudoRun(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    command: string,
    input?: string,
  ): Promise<string> {
    if (credential.username === 'root') return this.run(host, fingerprint, credential, command, input);
    return this.run(
      host,
      fingerprint,
      credential,
      `sudo -S sh -c ${shellQuote(command)}`,
      `${credential.password}\n${input ?? ''}`,
    );
  }

  private sudoRunScript(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    script: string,
  ): Promise<string> {
    return this.sudoRun(host, fingerprint, credential, 'base64 -d | sh', Buffer.from(script).toString('base64'));
  }

  private async run(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    command: string,
    input?: string,
  ): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'attraccess-cc100-'));
    const knownHosts = join(dir, 'known_hosts');
    const askPass = join(dir, 'askpass');
    try {
      await writeFile(knownHosts, await pinnedHostKey(host, fingerprint), { mode: 0o600 });
      await writeFile(askPass, '#!/bin/sh\nprintf \'%s\\n\' "$ATTRACCESS_SSH_PASSWORD"\n', { mode: 0o700 });
      return await runProcess(
        'ssh',
        [
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
      );
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
    onProgress: (percent: number) => void,
  ): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'attraccess-cc100-'));
    const knownHosts = join(dir, 'known_hosts');
    const askPass = join(dir, 'askpass');
    try {
      await writeFile(knownHosts, await pinnedHostKey(host, fingerprint), { mode: 0o600 });
      await writeFile(askPass, '#!/bin/sh\nprintf \'%s\\n\' "$ATTRACCESS_SSH_PASSWORD"\n', { mode: 0o700 });
      // Keep the credential-bearing script off the API host's process arguments.
      // read consumes one line; the installer receives the remaining binary stream.
      const receiver = runtimeBundleStreamReceiver;
      await uploadFile(
        source,
        [
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
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private save(session: WagoCommissioningSession, event: string): Promise<WagoCommissioningSession> {
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

  private reportTransferProgress(session: WagoCommissioningSession, percent: number): void {
    const progressPercent = 55 + Math.round((percent * 15) / 100);
    session.progressPercent = progressPercent;
    session.progressStep = 'Transferring runtime';
    session.progressDetail = `Uploading signed runtime bundle: ${percent}%.`;
    void this.sessions
      .update(session.id, {
        progressPercent,
        progressStep: session.progressStep,
        progressDetail: session.progressDetail,
        updatedAt: new Date().toISOString(),
      })
      .catch(() => this.context.logger?.warn('Could not update WAGO runtime transfer progress.'));
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
    try {
      await this.wago.revokeEnrollmentById(session.enrollmentId);
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
      for (const session of page) {
        try {
          if (session.state === 'recovery_revocation_pending') continue;
          if (
            ['completed', 'awaiting_verification', 'claim_interrupted'].includes(session.state) &&
            !session.pairingCode
          )
            continue;
          if (session.state === 'revoked' && !session.pairingCode) {
            await this.revokeSessionEnrollment(session);
            continue;
          }
          try {
            this.decryptVerifier(session);
          } catch {
            await this.invalidateVerifier(session);
            continue;
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
            session.progressDetail = 'Retry with explicit SSH credentials and installation confirmation.';
            session.failureReason = 'Commissioning was interrupted.';
            await this.save(session, 'delivery_interrupted');
            await this.revokeSessionEnrollment(session);
          }
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
        if (session.state === 'completed') await this.retireSupersededSessions(session.hardwareId, session.id);
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
    const { pairingCode: _pairingCode, deliveryToken: _deliveryToken, ...response } = session;
    void _pairingCode;
    void _deliveryToken;
    return response;
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
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...environment }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    const timer = setTimeout(() => child.kill(), SSH_TIMEOUT_MS);
    // A constrained controller may reject stdin before SSH exits; handle it without exposing process output.
    child.stdin.on('error', () => undefined);
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', () => undefined);
    child.on('error', () => {
      clearTimeout(timer);
      reject(new Error('Commissioning subprocess failed.'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error('Commissioning subprocess failed.'));
    });
    child.stdin.end(input);
  });
}

async function uploadFile(
  source: string,
  args: string[],
  environment: Record<string, string>,
  onProgress: (percent: number) => void,
  prefix?: string,
): Promise<void> {
  const size = (await stat(source)).size;
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', args, { env: { ...process.env, ...environment }, stdio: ['pipe', 'ignore', 'pipe'] });
    const stream = createReadStream(source);
    let transferred = 0;
    let lastPercent = -1;
    let settled = false;
    const timer = setTimeout(() => child.kill(), SSH_TIMEOUT_MS);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stream.destroy();
      if (error) reject(new Error('Commissioning upload failed.'));
      else resolve();
    };
    child.stdin.on('error', () => undefined);
    child.stderr.on('data', () => undefined);
    child.on('error', finish);
    child.on('close', (code) => finish(code === 0 ? undefined : new Error('Commissioning upload failed.')));
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

function isImmutableImage(image: string): boolean {
  return /@sha256:[a-f0-9]{64}$/i.test(image);
}

function isRuntimeArtifactConfigured(): boolean {
  return Boolean(
    isImmutableImage(configuredRuntimeImage) &&
    configuredRuntimeBundle &&
    configuredRuntimeBundleChecksum &&
    configuredRuntimeBundleSignature,
  );
}

async function verifyRuntimeBundle(): Promise<{ directory: string; path: string; bytes: number; digest: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'attraccess-cc100-runtime-'));
  const bundlePath = join(directory, 'runtime.tar');
  const checksumPath = join(directory, 'runtime.tar.sha256');
  const signaturePath = join(directory, 'runtime.tar.sig');
  try {
    const copies = await Promise.allSettled([
      copyFile(configuredRuntimeBundle, bundlePath),
      copyFile(configuredRuntimeBundleChecksum, checksumPath),
      copyFile(configuredRuntimeBundleSignature, signaturePath),
    ]);
    const failedCopy = copies.find((result) => result.status === 'rejected');
    if (failedCopy?.status === 'rejected') throw failedCopy.reason;
    const [bundle, checksum, signature] = await Promise.all([
      readFile(bundlePath),
      readFile(checksumPath, 'utf8'),
      stat(signaturePath),
    ]);
    if (!signature.isFile()) throw new ConflictException('CC100 runtime signature is not a file');

    const digest = createHash('sha256').update(bundle).digest('hex');
    if (
      !new RegExp(`^${digest}\\s+\\*?${escapeRegExp(configuredRuntimeBundle.split('/').pop() ?? '')}\\s*$`, 'm').test(
        checksum,
      )
    )
      throw new ConflictException('CC100 runtime bundle checksum does not match');

    const allowedSigners = join(directory, 'allowed_signers');
    const publicKey = await readFile(
      resolveRuntimeSigningPublicKeyPath(
        process.env.NODE_ENV,
        configuredRuntimeSigningPublicKey,
        join(__dirname, 'signing-public-key.pub'),
      ),
      'utf8',
    );
    await writeFile(allowedSigners, `${SIGNING_IDENTITY} ${publicKey.trim()}\n`, { mode: 0o600 });
    try {
      await runProcess(
        'ssh-keygen',
        ['-Y', 'verify', '-f', allowedSigners, '-I', SIGNING_IDENTITY, '-n', SIGNING_NAMESPACE, '-s', signaturePath],
        bundle,
      );
    } finally {
      await rm(allowedSigners, { force: true });
    }
    return { directory, path: bundlePath, bytes: bundle.length, digest };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isSupportedController(inspection: string, firmwareBaseline: string): boolean {
  if (!inspection.includes('PTXDIST_PLATFORM_NAME="cc100"')) return false;
  const reportedFirmware = inspection.match(/^VERSION_ID=["']?([^"'\r\n]+)["']?$/m)?.[1]?.trim();
  if (reportedFirmware === firmwareBaseline.trim()) return true;

  // WAGO CC100 firmware revision 31 is built on the 2024.12.0 PTXdist BSP.
  return firmwareBaseline.trim() === '31' && reportedFirmware === '2024.12.0';
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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\\"'\\\"'")}'`;
}

function requireDeliveryCredentials(input: DeliveryInput): TemporarySshCredential {
  if (input?.confirmInstall !== true)
    throw new ConflictException('explicit installation confirmation is required for every delivery attempt');
  const credential = input.temporarySsh;
  if (
    !credential ||
    typeof credential.username !== 'string' ||
    !/^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/.test(credential.username) ||
    typeof credential.password !== 'string' ||
    !credential.password.trim() ||
    /[\r\n\0]/.test(credential.password)
  )
    throw new ConflictException('explicit valid SSH username and password are required for every delivery attempt');
  return credential;
}
