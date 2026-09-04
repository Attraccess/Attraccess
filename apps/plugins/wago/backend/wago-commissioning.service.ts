import { ConflictException, Inject, Injectable, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PLUGIN_CONTEXT, PluginContext, Repository } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoService } from './wago.service';

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
const defaultSshCredential: TemporarySshCredential = { username: 'root', password: 'wago' };

@Injectable()
export class WagoCommissioningService implements OnApplicationBootstrap {
  private sessions!: Repository<WagoCommissioningSession>;
  private readonly deliveryLocks = new Map<number, Promise<void>>();

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(WagoService) private readonly wago: WagoService,
  ) {}

  onApplicationBootstrap(): void {
    // The host datasource is available only after plugin module construction completes.
    this.sessions = this.context.getRepository(WagoCommissioningSession);
    this.wago.registerCommissioningDiscoveryHandler((controller) => this.claimDiscovered(controller));
    void this.resumePendingDeliveries().catch((error) =>
      this.context.logger?.warn(`Could not resume pending WAGO commissioning deliveries: ${String(error)}`),
    );
    void this.reconcileCompletedSessions().catch((error) =>
      this.context.logger?.warn(`Could not retire superseded WAGO commissioning sessions: ${String(error)}`),
    );
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

  async create(input: { mqttServerId: number; targetHost: string; name: string }): Promise<WagoCommissioningSession> {
    if (!isPrivateAddress(input.targetHost)) throw new ConflictException('commissioning is limited to a private controller address');
    if (!input.name.trim()) throw new ConflictException('a controller name is required');
    if (!configuredFirmwareBaseline)
      throw new ConflictException('no CC100 firmware baseline is configured; commissioning is disabled until an exact supported baseline is set');
    if (!(await this.context.getMqttServerConfig(input.mqttServerId))) throw new NotFoundException('MQTT server not found');

    const hostKeyFingerprint = await scanHostKey(input.targetHost);
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
        state: 'awaiting_delivery',
        enrollmentExpiresAt: null,
        enrollmentId: null,
        // This verifier authenticates the first runtime announcement and is never exposed to an operator.
        pairingCode: randomBytes(32).toString('base64url'),
        codesysState: null,
        progressPercent: 0,
        progressStep: 'Identity scanned',
        progressDetail: 'SSH host key captured and pinned for automatic verification.',
        auditLog: JSON.stringify([{ at: now, event: 'host_key_scanned' }]),
        failureReason: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    // Delivery belongs to the server so it continues after the browser closes or reloads.
    void this.deliverInBackground(session.id);
    return session;
  }

  async list(limit = 50, offset = 0): Promise<Array<Omit<WagoCommissioningSession, 'pairingCode'>>> {
    const take = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
    const skip = Number.isSafeInteger(offset) ? Math.max(offset, 0) : 0;
    const sessions = await this.sessions.find({ order: { updatedAt: 'DESC' }, take, skip });
    return sessions.map((session) =>
      Object.fromEntries(Object.entries(session).filter(([field]) => field !== 'pairingCode')) as Omit<
        WagoCommissioningSession,
        'pairingCode'
      >,
    );
  }

  async deliver(
    id: number,
    input: { temporarySsh?: TemporarySshCredential } = {},
  ): Promise<WagoCommissioningSession> {
    return this.withDeliveryLock(id, () => this.deliverWhileLocked(id, input));
  }

  private async deliverWhileLocked(
    id: number,
    input: { temporarySsh?: TemporarySshCredential },
  ): Promise<WagoCommissioningSession> {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    if (!['awaiting_delivery', 'delivering', 'awaiting_identity_confirmation', 'awaiting_codesys_confirmation', 'delivery_failed'].includes(session.state))
      throw new ConflictException('commissioning session cannot be delivered in its current state');
    if (!isRuntimeArtifactConfigured())
      throw new ConflictException('no immutable, signed CC100 runtime bundle is configured for commissioning');

    const credential = input.temporarySsh?.username.trim() && input.temporarySsh.password ? input.temporarySsh : defaultSshCredential;
    let enrollmentExpiresAt: string | null = null;

    try {
      session.state = 'delivering';
      session.failureReason = null;
      await this.updateProgress(session, 10, 'Verifying controller identity', 'Rechecking the pinned SSH host key and inspecting the CC100.');
      const inspection = await this.inspect(session.targetHost, session.hostKeyFingerprint, credential);
      session.codesysState = inspection.codesys;
      if (!isSupportedController(inspection.firmware, session.firmwareBaseline))
        throw new ConflictException(`unsupported CC100 model or firmware; expected baseline ${session.firmwareBaseline}`);
      await this.updateProgress(session, 20, 'Checking runtime package', 'Verifying the signed commissioning runtime bundle.');
      const bundle = await verifyRuntimeBundle();

      if (inspection.codesys === 'active') {
        await this.updateProgress(session, 30, 'Stopping CODESYS', 'Stopping the active CODESYS runtime before commissioning.');
        await this.sudoRun(session.targetHost, session.hostKeyFingerprint, credential, 'kill $(pidof codesys3) 2>/dev/null || true');
        await this.sudoRun(session.targetHost, session.hostKeyFingerprint, credential, '/etc/config-tools/config_runtime runtime-version=0');
      }
      await this.updateProgress(session, 40, 'Activating Docker', 'Preparing the controller runtime environment.');
      await this.sudoRun(session.targetHost, session.hostKeyFingerprint, credential, '/etc/config-tools/config_docker activate');
      try {
        await this.updateProgress(session, 55, 'Transferring runtime', 'Uploading the signed runtime bundle to the controller.');
        await this.copyTo(session.targetHost, session.hostKeyFingerprint, credential, bundle.path, '/tmp/attraccess-wago-runtime.tar', (percent) =>
          this.reportTransferProgress(session, percent),
        );
        await this.updateProgress(session, 75, 'Creating enrollment', 'Provisioning a restricted MQTT credential for the initial connection.');
        const enrollment = await this.wago.createEnrollment(session.hardwareId, session.mqttServerId);
        if (!enrollment.password) throw new ConflictException('automatic restricted MQTT credential provisioning is required for secure commissioning');
        if (!session.pairingCode) throw new ConflictException('commissioning session has no automatic claim verifier');
        session.enrollmentId = enrollment.id;
        enrollmentExpiresAt = enrollment.expiresAt;
        await this.updateProgress(session, 82, 'Writing runtime configuration', 'Installing the controller identity and restricted connection settings.');
        await this.writeRuntimeEnvironment(
          session.targetHost,
          session.hostKeyFingerprint,
          credential,
          [
            `WAGO_HARDWARE_ID=${session.hardwareId}`,
            `WAGO_MQTT_URL=${enrollment.broker.useTls ? 'mqtts' : 'mqtt'}://${enrollment.broker.host}:${enrollment.broker.port}`,
            `WAGO_MQTT_USERNAME=${enrollment.username}`,
            `WAGO_MQTT_PASSWORD=${enrollment.password}`,
            `WAGO_ENROLLMENT_SECRET=${enrollment.claimSecret}`,
            `WAGO_PAIRING_CODE=${session.pairingCode}`,
          ].join('\n'),
        );
        await this.updateProgress(session, 92, 'Starting runtime', 'Loading and starting the commissioning runtime on the controller.');
        await this.sudoRunScript(
          session.targetHost,
          session.hostKeyFingerprint,
          credential,
          runtimeBundleInstallScript(configuredRuntimeImage),
        );
      } finally {
        await rm(bundle.directory, { recursive: true, force: true });
      }

      session.state = 'awaiting_discovery';
      session.enrollmentExpiresAt = enrollmentExpiresAt;
      session.failureReason = null;
      session.progressPercent = 100;
      session.progressStep = 'Waiting for controller connection';
      session.progressDetail = 'Runtime delivered. Waiting for the controller to connect and complete its automatic claim.';
      return this.save(session, 'bootstrap_delivered');
    } catch (error) {
      if (session.enrollmentId !== null) {
        try {
          await this.wago.revokeEnrollmentById(session.enrollmentId);
        } catch (revocationError) {
          session.state = 'delivery_failed';
          session.enrollmentExpiresAt = null;
          session.progressStep = 'Delivery failed';
          session.progressDetail = 'Credential revocation requires attention before delivery can be retried.';
          session.failureReason = `Secure delivery failed and bootstrap credential revocation requires attention: ${redact(
            revocationError instanceof Error ? revocationError.message : String(revocationError),
          )}`;
          return this.save(session, 'enrollment_revocation_failed');
        }
      }
      session.state = 'delivery_failed';
      session.enrollmentExpiresAt = null;
      session.progressStep = 'Delivery failed';
      session.progressDetail = 'Review the error and retry automatic delivery when the controller is reachable.';
      session.failureReason = error instanceof Error ? redact(error.message) : 'Secure delivery failed';
      return this.save(session, 'delivery_failed');
    }
  }

  async revoke(id: number): Promise<WagoCommissioningSession> {
    return this.withDeliveryLock(id, async () => {
      const session = await this.sessions.findOneBy({ id });
      if (!session) throw new NotFoundException('commissioning session not found');
      if (session.enrollmentId !== null) await this.wago.revokeEnrollmentById(session.enrollmentId);
      session.state = 'revoked';
      session.failureReason = null;
      return this.save(session, 'revoked');
    });
  }

  async remove(id: number): Promise<void> {
    await this.withDeliveryLock(id, async () => {
      const session = await this.sessions.findOneBy({ id });
      if (!session) throw new NotFoundException('commissioning session not found');
      if (session.enrollmentId !== null) {
        await this.wago.revokeEnrollmentById(session.enrollmentId);
        await this.wago.deleteEnrollmentById(session.enrollmentId);
      }
      await this.sessions.delete(id);
    });
  }

  async removeByHardwareId(hardwareId: string): Promise<void> {
    const sessions = await this.sessions.find({ where: { hardwareId } });
    await Promise.all(sessions.map((session) => this.remove(session.id)));
  }

  async claimDiscovered(controller: { id: number; hardwareId: string; mqttServerId: number | null; enrollmentId: number | null }): Promise<void> {
    if (!controller.mqttServerId || !controller.enrollmentId) return;
    const session = await this.sessions.findOneBy({
      hardwareId: controller.hardwareId,
      mqttServerId: controller.mqttServerId,
      enrollmentId: controller.enrollmentId,
      state: 'awaiting_discovery',
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

      current.state = 'awaiting_claim';
      current.failureReason = null;
      current.progressPercent = 100;
      current.progressStep = 'Claiming controller';
      current.progressDetail = 'Applying permanent credentials and the reserved controller name.';
      await this.save(current, 'automatic_claim_started');
      try {
        await this.wago.claim(controller.id, current.controllerName, current.pairingCode, current.mqttServerId);
        current.state = 'completed';
        current.pairingCode = null;
        current.failureReason = null;
        current.progressStep = 'Commissioning complete';
        current.progressDetail = 'The controller is claimed and ready to configure.';
        await this.save(current, 'automatic_claim_completed');
      } catch (error) {
        current.state = 'awaiting_discovery';
        current.failureReason = error instanceof Error ? redact(error.message) : 'Automatic claim failed';
        await this.save(current, 'automatic_claim_failed');
        return;
      }
      await this.retireSupersededSessions(current.hardwareId, current.id).catch((error) =>
        this.context.logger?.warn(`Could not retire superseded WAGO commissioning sessions: ${String(error)}`),
      );
    });
  }

  private async inspect(host: string, fingerprint: string, credential: TemporarySshCredential): Promise<{ firmware: string; codesys: string }> {
    const output = await this.run(host, fingerprint, credential, "cat /etc/os-release; printf '\\nCODESYS='; ps");
    const marker = '\nCODESYS=';
    const markerIndex = output.indexOf(marker);
    const firmware = markerIndex >= 0 ? output.slice(0, markerIndex) : output;
    const processes = markerIndex >= 0 ? output.slice(markerIndex + marker.length) : '';
    return { firmware, codesys: /codesys/i.test(processes) ? 'active' : 'inactive' };
  }

  private async writeRuntimeEnvironment(host: string, fingerprint: string, credential: TemporarySshCredential, content: string): Promise<void> {
    await this.sudoRun(
      host,
      fingerprint,
      credential,
      'mkdir -p /etc/attraccess-wago && chmod 0700 /etc/attraccess-wago && umask 077 && base64 -d > /etc/attraccess-wago/runtime.env && chmod 0600 /etc/attraccess-wago/runtime.env',
      Buffer.from(content).toString('base64'),
    );
  }

  private sudoRun(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    command: string,
    input?: string,
  ): Promise<string> {
    if (credential.username === 'root') return this.run(host, fingerprint, credential, command, input);
    return this.run(host, fingerprint, credential, `sudo -S sh -c ${shellQuote(command)}`, `${credential.password}\n${input ?? ''}`);
  }

  private sudoRunScript(host: string, fingerprint: string, credential: TemporarySshCredential, script: string): Promise<string> {
    return this.sudoRun(host, fingerprint, credential, 'base64 -d | sh', Buffer.from(script).toString('base64'));
  }

  private async run(host: string, fingerprint: string, credential: TemporarySshCredential, command: string, input?: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'attraccess-cc100-'));
    const knownHosts = join(dir, 'known_hosts');
    const askPass = join(dir, 'askpass');
    try {
      await writeFile(knownHosts, await pinnedHostKey(host, fingerprint), { mode: 0o600 });
      await writeFile(askPass, '#!/bin/sh\nprintf \'%s\\n\' "$ATTRACCESS_SSH_PASSWORD"\n', { mode: 0o700 });
      return await runProcess(
        'ssh',
        [
          '-o', 'BatchMode=no', '-o', 'NumberOfPasswordPrompts=1', '-o', 'HostKeyAlgorithms=ssh-ed25519', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${knownHosts}`,
          '-o', 'ConnectTimeout=15', `${credential.username}@${host}`, `sh -c ${shellQuote(command)}`,
        ],
        input,
        { SSH_ASKPASS: askPass, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: 'attraccess', ATTRACCESS_SSH_PASSWORD: credential.password },
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
    destination: string,
    onProgress: (percent: number) => void,
  ): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'attraccess-cc100-'));
    const knownHosts = join(dir, 'known_hosts');
    const askPass = join(dir, 'askpass');
    try {
      await writeFile(knownHosts, await pinnedHostKey(host, fingerprint), { mode: 0o600 });
      await writeFile(askPass, '#!/bin/sh\nprintf \'%s\\n\' "$ATTRACCESS_SSH_PASSWORD"\n', { mode: 0o700 });
      await uploadFile(
        source,
        [
          '-o', 'BatchMode=no', '-o', 'NumberOfPasswordPrompts=1', '-o', 'HostKeyAlgorithms=ssh-ed25519', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${knownHosts}`,
          '-o', 'ConnectTimeout=15', `${credential.username}@${host}`, `mkdir -p ${shellQuote(dirname(destination))} && cat > ${shellQuote(destination)}`,
        ],
        { SSH_ASKPASS: askPass, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: 'attraccess', ATTRACCESS_SSH_PASSWORD: credential.password },
        onProgress,
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
      .catch((error) => this.context.logger?.warn(`Could not update WAGO runtime transfer progress: ${String(error)}`));
  }

  private async resumePendingDeliveries(): Promise<void> {
    const sessions = await this.sessions.find({ where: [{ state: 'awaiting_delivery' }, { state: 'delivering' }] });
    for (const session of sessions) void this.deliverInBackground(session.id);
  }

  private async reconcileCompletedSessions(): Promise<void> {
    const sessions = await this.sessions.find({ where: { state: 'completed' } });
    await Promise.all(sessions.map((session) => this.retireSupersededSessions(session.hardwareId, session.id)));
  }

  private async retireSupersededSessions(hardwareId: string, completedSessionId: number): Promise<void> {
    const sessions = await this.sessions.find({ where: { hardwareId } });
    await Promise.all(
      sessions
        .filter((session) => session.id !== completedSessionId && session.state !== 'completed' && session.state !== 'revoked')
        .map((session) =>
          this.withDeliveryLock(session.id, async () => {
            const current = await this.sessions.findOneBy({ id: session.id });
            if (!current || current.state === 'completed' || current.state === 'revoked') return;
            current.state = 'revoked';
            current.failureReason = null;
            current.progressStep = 'Superseded by completed commissioning';
            current.progressDetail = 'A newer commissioning session claimed this controller.';
            await this.save(current, 'superseded_by_completed_session');
          }),
        ),
    );
  }

  private async deliverInBackground(id: number): Promise<void> {
    try {
      await this.deliver(id);
    } catch (error) {
      try {
        const session = await this.sessions.findOneBy({ id });
        if (!session || !['awaiting_delivery', 'delivering'].includes(session.state)) return;
        session.state = 'delivery_failed';
        session.progressStep = 'Delivery failed';
        session.progressDetail = 'Review the error and retry automatic delivery when the controller is reachable.';
        session.failureReason = error instanceof Error ? redact(error.message) : 'Secure delivery failed';
        await this.save(session, 'delivery_failed');
      } catch (reportingError) {
        this.context.logger?.warn(`Could not record WAGO commissioning delivery failure: ${String(reportingError)}`);
      }
    }
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
    if ((await fingerprintFor(knownHosts)) !== expectedFingerprint) throw new ConflictException('controller SSH host key changed after automatic identity verification');
    return `${key}\n`;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function fingerprintFor(knownHosts: string): Promise<string> {
  const result = (await runProcess('ssh-keygen', ['-lf', knownHosts, '-E', 'sha256'])).match(/(SHA256:[A-Za-z0-9+/=]+)/)?.[1];
  if (!result) throw new ConflictException('the controller did not provide a supported SSH host key');
  return result;
}

function runProcess(command: string, args: string[], input?: string | Buffer, environment?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...environment }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), SSH_TIMEOUT_MS);
    // A constrained controller may reject stdin before SSH exits; preserve its error instead of crashing the API.
    child.stdin.on('error', () => undefined);
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `${command} exited with status ${code}`));
    });
    child.stdin.end(input);
  });
}

async function uploadFile(
  source: string,
  args: string[],
  environment: Record<string, string>,
  onProgress: (percent: number) => void,
): Promise<void> {
  const size = (await stat(source)).size;
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', args, { env: { ...process.env, ...environment }, stdio: ['pipe', 'ignore', 'pipe'] });
    const stream = createReadStream(source);
    let stderr = '';
    let transferred = 0;
    let lastPercent = -1;
    let settled = false;
    const timer = setTimeout(() => child.kill(), SSH_TIMEOUT_MS);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stream.destroy();
      if (error) reject(error);
      else resolve();
    };
    child.stdin.on('error', () => undefined);
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', finish);
    child.on('close', (code) => finish(code === 0 ? undefined : new Error(stderr || `ssh exited with status ${code}`)));
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

function redact(value: string): string {
  return value.replace(/(?:password|secret|token)=?[^\s]*/gi, '[redacted]');
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

async function verifyRuntimeBundle(): Promise<{ directory: string; path: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'attraccess-cc100-runtime-'));
  const bundlePath = join(directory, 'runtime.tar');
  const checksumPath = join(directory, 'runtime.tar.sha256');
  const signaturePath = join(directory, 'runtime.tar.sig');
  try {
    await Promise.all([
      copyFile(configuredRuntimeBundle, bundlePath),
      copyFile(configuredRuntimeBundleChecksum, checksumPath),
      copyFile(configuredRuntimeBundleSignature, signaturePath),
    ]);
    const [bundle, checksum, signature] = await Promise.all([readFile(bundlePath), readFile(checksumPath, 'utf8'), stat(signaturePath)]);
    if (!signature.isFile()) throw new ConflictException('CC100 runtime signature is not a file');

    const digest = createHash('sha256').update(bundle).digest('hex');
    if (!new RegExp(`^${digest}\\s+\\*?${escapeRegExp(configuredRuntimeBundle.split('/').pop() ?? '')}\\s*$`, 'm').test(checksum))
      throw new ConflictException('CC100 runtime bundle checksum does not match');

    const allowedSigners = join(directory, 'allowed_signers');
    const publicKey = await readFile(
      resolveRuntimeSigningPublicKeyPath(process.env.NODE_ENV, configuredRuntimeSigningPublicKey, join(__dirname, 'signing-public-key.pub')),
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
    return { directory, path: bundlePath };
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

export function runtimeBundleInstallScript(runtimeImage: string): string {
  return `rm -rf /tmp/attraccess-wago-runtime && mkdir -m 0700 /tmp/attraccess-wago-runtime && tar --warning=no-timestamp --warning=no-unknown-keyword -xf /tmp/attraccess-wago-runtime.tar -C /tmp/attraccess-wago-runtime && rm -f /tmp/attraccess-wago-runtime.tar && grep -Fqx -- ${shellQuote(runtimeImage)} /tmp/attraccess-wago-runtime/image-reference && runtime_image=$(docker load -i /tmp/attraccess-wago-runtime/image.tar | sed -n -e 's/^Loaded image: //p' -e 's/^Loaded image ID: //p') && test -n "$runtime_image" && rm -rf /tmp/attraccess-wago-runtime && docker image inspect "$runtime_image" >/dev/null && (docker rm -f attraccess-wago >/dev/null 2>&1 || true) && mkdir -p /var/lib/attraccess-wago && chown 10001:10001 /var/lib/attraccess-wago && docker run -d --name attraccess-wago --restart unless-stopped --env-file /etc/attraccess-wago/runtime.env -v /var/lib/attraccess-wago:/var/lib/attraccess-wago "$runtime_image"`;
}

export function resolveRuntimeSigningPublicKeyPath(environment: string | undefined, localPath: string, releasePath: string): string {
  if (!localPath) return releasePath;
  if (environment !== 'development') throw new ConflictException('local CC100 runtime signing keys are only allowed in development');
  return localPath;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\\"'\\\"'")}'`;
}
