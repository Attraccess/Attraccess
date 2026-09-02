import { ConflictException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLUGIN_CONTEXT, PluginContext, Repository } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoService } from './wago.service';

const SSH_TIMEOUT_MS = 20_000;
// The initial supported CC100 commissioning baseline. Operators may pin a more
// specific vendor firmware identifier through configuration as it becomes available.
const configuredFirmwareBaseline = process.env.WAGO_CC100_FIRMWARE_BASELINE?.trim() || '31';
const configuredRuntimeImage = process.env.WAGO_CC100_RUNTIME_IMAGE?.trim() ?? '';
const configuredRuntimeBundle = process.env.WAGO_CC100_RUNTIME_BUNDLE_PATH?.trim() ?? '';
const configuredRuntimeBundleChecksum = process.env.WAGO_CC100_RUNTIME_BUNDLE_SHA256_PATH?.trim() ?? '';
const configuredRuntimeBundleSignature = process.env.WAGO_CC100_RUNTIME_BUNDLE_SIGNATURE_PATH?.trim() ?? '';
const SIGNING_NAMESPACE = 'attraccess-wago-runtime';
const SIGNING_IDENTITY = 'attraccess-wago-runtime';

type TemporarySshCredential = { username: string; password: string };

@Injectable()
export class WagoCommissioningService implements OnModuleInit {
  private sessions!: Repository<WagoCommissioningSession>;

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    private readonly wago: WagoService,
  ) {}

  onModuleInit(): void {
    // The host datasource is available only after plugin module construction completes.
    this.sessions = this.context.getRepository(WagoCommissioningSession);
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

  async create(input: { hardwareId: string; mqttServerId: number; targetHost: string }): Promise<WagoCommissioningSession> {
    const hardwareId = input.hardwareId.trim();
    if (!/^[A-Za-z0-9._-]+$/.test(hardwareId)) throw new ConflictException('a valid controller hardware ID is required');
    if (!isPrivateAddress(input.targetHost)) throw new ConflictException('commissioning is limited to a private controller address');
    if (!configuredFirmwareBaseline)
      throw new ConflictException('no CC100 firmware baseline is configured; commissioning is disabled until an exact supported baseline is set');
    if (!(await this.context.getMqttServerConfig(input.mqttServerId))) throw new NotFoundException('MQTT server not found');

    const hostKeyFingerprint = await scanHostKey(input.targetHost);
    const now = new Date().toISOString();
    return this.sessions.save(
      this.sessions.create({
        hardwareId,
        mqttServerId: input.mqttServerId,
        targetHost: input.targetHost,
        hostKeyFingerprint,
        firmwareBaseline: configuredFirmwareBaseline,
        state: 'awaiting_identity_confirmation',
        enrollmentExpiresAt: null,
        codesysState: null,
        auditLog: JSON.stringify([{ at: now, event: 'host_key_scanned' }]),
        failureReason: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  async list(): Promise<WagoCommissioningSession[]> {
    return this.sessions.find({ order: { updatedAt: 'DESC' } });
  }

  async deliver(
    id: number,
    input: {
      hostKeyFingerprint: string;
      physicalIdentityConfirmed: boolean;
      codesysStopConfirmed: boolean;
      temporarySsh: TemporarySshCredential;
    },
  ): Promise<WagoCommissioningSession> {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    if (session.state === 'completed' || session.state === 'revoked') throw new ConflictException('commissioning session is no longer active');
    if (!input.physicalIdentityConfirmed) throw new ConflictException('physical controller identity confirmation is required');
    if (input.hostKeyFingerprint !== session.hostKeyFingerprint) throw new ConflictException('controller SSH host key does not match the scanned key');
    if (!input.temporarySsh.username.trim() || !input.temporarySsh.password)
      throw new ConflictException('temporary SSH credentials are required for this session only');
    if (!isRuntimeArtifactConfigured())
      throw new ConflictException('no immutable, signed CC100 runtime bundle is configured for commissioning');

    try {
      const inspection = await this.inspect(session.targetHost, session.hostKeyFingerprint, input.temporarySsh);
      session.codesysState = inspection.codesys;
      if (!isSupportedController(inspection.firmware, session.firmwareBaseline)) {
        throw new ConflictException(`unsupported CC100 model or firmware; expected baseline ${session.firmwareBaseline}`);
      }
      if (inspection.codesys === 'active' && !input.codesysStopConfirmed) {
        session.state = 'awaiting_codesys_confirmation';
        session.failureReason = 'CODESYS is active; explicit administrator confirmation is required before it is stopped.';
        return this.save(session, 'codesys_confirmation_required');
      }

      const bundle = await verifyRuntimeBundle();

      const enrollment = await this.wago.createEnrollment(session.hardwareId, session.mqttServerId);
      if (!enrollment.password) throw new ConflictException('automatic restricted MQTT credential provisioning is required for secure commissioning');
      const runtimeEnv = [
        `WAGO_HARDWARE_ID=${session.hardwareId}`,
        `WAGO_MQTT_URL=${enrollment.broker.useTls ? 'mqtts' : 'mqtt'}://${enrollment.broker.host}:${enrollment.broker.port}`,
        `WAGO_MQTT_USERNAME=${enrollment.username}`,
        `WAGO_MQTT_PASSWORD=${enrollment.password}`,
        `WAGO_ENROLLMENT_SECRET=${enrollment.claimSecret}`,
      ].join('\n');

      if (inspection.codesys === 'active')
        await this.sudoRun(session.targetHost, session.hostKeyFingerprint, input.temporarySsh, '/etc/init.d/pp_codesys3 stop');
      await this.sudoRun(
        session.targetHost,
        session.hostKeyFingerprint,
        input.temporarySsh,
        'docker info >/dev/null 2>&1 || /etc/init.d/dockerd start; docker info >/dev/null',
      );
      await this.writeRuntimeEnvironment(session.targetHost, session.hostKeyFingerprint, input.temporarySsh, runtimeEnv);
      try {
        await this.copyTo(session.targetHost, session.hostKeyFingerprint, input.temporarySsh, bundle.path, '/tmp/attraccess-wago-runtime.tar');
        await this.sudoRun(
          session.targetHost,
          session.hostKeyFingerprint,
          input.temporarySsh,
          `rm -rf /tmp/attraccess-wago-runtime && mkdir -m 0700 /tmp/attraccess-wago-runtime && tar -xf /tmp/attraccess-wago-runtime.tar -C /tmp/attraccess-wago-runtime && rm -f /tmp/attraccess-wago-runtime.tar && grep -Fqx -- ${shellQuote(configuredRuntimeImage)} /tmp/attraccess-wago-runtime/image-reference && docker load -i /tmp/attraccess-wago-runtime/image.tar && rm -rf /tmp/attraccess-wago-runtime && docker image inspect ${runtimeImageTag()} >/dev/null && (docker rm -f attraccess-wago >/dev/null 2>&1 || true) && docker run -d --name attraccess-wago --restart unless-stopped --env-file /etc/attraccess-wago/runtime.env -v /var/lib/attraccess-wago:/var/lib/attraccess-wago ${runtimeImageTag()}`,
        );
      } finally {
        await rm(bundle.directory, { recursive: true, force: true });
      }

      session.state = 'awaiting_discovery';
      session.enrollmentExpiresAt = enrollment.expiresAt;
      session.failureReason = null;
      return this.save(session, 'bootstrap_delivered');
    } catch (error) {
      session.state = 'delivery_failed';
      session.failureReason = error instanceof Error ? redact(error.message) : 'Secure delivery failed';
      return this.save(session, 'delivery_failed');
    }
  }

  async revoke(id: number): Promise<WagoCommissioningSession> {
    const session = await this.sessions.findOneBy({ id });
    if (!session) throw new NotFoundException('commissioning session not found');
    await this.wago.revokeEnrollmentForHardwareId(session.hardwareId);
    session.state = 'revoked';
    session.failureReason = null;
    return this.save(session, 'revoked');
  }

  private async inspect(host: string, fingerprint: string, credential: TemporarySshCredential): Promise<{ firmware: string; codesys: string }> {
    const output = await this.run(host, fingerprint, credential, "cat /etc/os-release; printf '\\nCODESYS='; ps");
    const [, codesys = 'unknown'] = output.match(/CODESYS=([^\r\n]*)/) ?? [];
    return { firmware: output, codesys: /codesys/i.test(codesys) ? 'active' : 'inactive' };
  }

  private async writeRuntimeEnvironment(host: string, fingerprint: string, credential: TemporarySshCredential, content: string): Promise<void> {
    await this.sudoRun(
      host,
      fingerprint,
      credential,
      'install -d -m 0700 /etc/attraccess-wago && umask 077 && base64 -d > /etc/attraccess-wago/runtime.env && chmod 0600 /etc/attraccess-wago/runtime.env',
      Buffer.from(content).toString('base64'),
    );
  }

  private async sudoRun(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    command: string,
    input?: string,
  ): Promise<string> {
    return this.run(host, fingerprint, credential, `sudo -S sh -c ${shellQuote(command)}`, `${credential.password}\n${input ?? ''}`);
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
          '-o', 'ConnectTimeout=15', `${credential.username}@${host}`, 'sh', '-c', command,
        ],
        input,
        { SSH_ASKPASS: askPass, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: 'attraccess', ATTRACCESS_SSH_PASSWORD: credential.password },
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async copyTo(host: string, fingerprint: string, credential: TemporarySshCredential, source: string, destination: string): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'attraccess-cc100-'));
    const knownHosts = join(dir, 'known_hosts');
    const askPass = join(dir, 'askpass');
    try {
      await writeFile(knownHosts, await pinnedHostKey(host, fingerprint), { mode: 0o600 });
      await writeFile(askPass, '#!/bin/sh\nprintf \'%s\\n\' "$ATTRACCESS_SSH_PASSWORD"\n', { mode: 0o700 });
      await runProcess(
        'scp',
        [
          '-o', 'BatchMode=no', '-o', 'NumberOfPasswordPrompts=1', '-o', 'HostKeyAlgorithms=ssh-ed25519', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${knownHosts}`,
          '-o', 'ConnectTimeout=15', source, `${credential.username}@${host}:${destination}`,
        ],
        undefined,
        { SSH_ASKPASS: askPass, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: 'attraccess', ATTRACCESS_SSH_PASSWORD: credential.password },
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
}

async function scanHostKey(host: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'attraccess-cc100-'));
  const knownHosts = join(dir, 'known_hosts');
  try {
    await writeFile(knownHosts, await scanHostKeys(host), { mode: 0o600 });
    return fingerprintFor(knownHosts);
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
    if ((await fingerprintFor(knownHosts)) !== expectedFingerprint) throw new ConflictException('controller SSH host key changed after identity confirmation');
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
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  const [bundle, checksum, signature] = await Promise.all([readFile(bundlePath), readFile(checksumPath, 'utf8'), stat(signaturePath)]);
  if (!signature.isFile()) throw new ConflictException('CC100 runtime signature is not a file');

  const digest = createHash('sha256').update(bundle).digest('hex');
  if (!new RegExp(`^${digest}\\s+\\*?${escapeRegExp(configuredRuntimeBundle.split('/').pop() ?? '')}\\s*$`, 'm').test(checksum)) {
    throw new ConflictException('CC100 runtime bundle checksum does not match');
  }

  try {
    const allowedSigners = join(directory, 'allowed_signers');
    const publicKey = await readFile(join(__dirname, 'signing-public-key.pub'), 'utf8');
    await writeFile(allowedSigners, `${SIGNING_IDENTITY} ${publicKey.trim()}\n`, { mode: 0o600 });
    await runProcess(
      'ssh-keygen',
      ['-Y', 'verify', '-f', allowedSigners, '-I', SIGNING_IDENTITY, '-n', SIGNING_NAMESPACE, '-s', signaturePath],
      bundle,
    );
  } finally {
    await rm(join(directory, 'allowed_signers'), { force: true });
  }
  return { directory, path: bundlePath };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function runtimeImageTag(): string {
  return configuredRuntimeImage.split('@', 1)[0];
}

function isSupportedController(inspection: string, firmwareBaseline: string): boolean {
  if (!inspection.includes('PTXDIST_PLATFORM_NAME="cc100"')) return false;
  // Current CTL images do not expose their WBM firmware release over SSH. The
  // administrator confirms that physical release in the pinned-host-key flow.
  const reportedFirmware = inspection.match(/firmware[^\r\n]*?(\d+(?:\.\d+)+|\d+)/i)?.[1];
  return !reportedFirmware || reportedFirmware.includes(firmwareBaseline);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\\"'\\\"'")}'`;
}
