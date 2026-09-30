import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DataSource } from 'typeorm';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoManagedRuntimeService } from './wago-managed-runtime.service';
import { WagoManagedAccess, WagoRuntimeUpdateEntity, WagoDeviceOperation } from './wago-managed-access.entity';
import { WagoDeviceOperations } from './wago-device-operations';
import { WagoManagedUpdates1780010650000 } from './migrations/1780010650000-add-wago-managed-updates';
import { WagoController } from './wago-controller.entity';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoService } from './wago.service';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import { managedSsh, managedSshFailure } from './wago-managed-ssh';
import { commissioningVerification } from './wago-commissioning-verification';
import { managedHostHelper } from './wago-managed-helper';
import {
  managedProvisionScript,
  managedCutoverScript,
  managedCommitScript,
  managedAccessWatchdog,
  managedWatchdogScript,
} from './wago-managed-provision';
import type { BuildRuntimeArtifact } from './wago-build-runtime';
import { generateManagementKey } from './wago-management-key';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WAGO_DIN, WAGO_DOUT } from './wago-hardware-deployment';
import { runtimeBundleDeliveryScript } from './wago-runtime-install';
import { generateInstallerAuthority, signInstaller, MANAGED_HELPER_PROTOCOL } from './wago-managed-installer';

jest.mock('@attraccess/plugins-backend-sdk', () => jest.requireActual('typeorm'));
jest.mock('./wago.service', () => ({ WagoService: class {} }));
jest.mock('./wago-runtime-artifacts', () => ({ WagoRuntimeArtifactsService: class {} }));
jest.mock('./wago-commissioning-readiness', () => ({ WagoCommissioningReadiness: class {} }));
jest.mock('./wago-managed-ssh', () => ({ ...jest.requireActual('./wago-managed-ssh'), managedSsh: jest.fn() }));
jest.mock('./wago-commissioning-verification', () => ({ commissioningVerification: jest.fn() }));

const artifact: BuildRuntimeArtifact = {
  imageId: `sha256:${'1'.repeat(64)}`,
  image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'2'.repeat(64)}`,
  buildId: '3'.repeat(40),
  digest: '4'.repeat(64),
  bytes: 81920,
  manifest: {
    schemaVersion: 1,
    runtime: 'attraccess-wago-cc100',
    runtimeVersion: '0.1.0',
    protocolVersion: '1.0.0',
    image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'2'.repeat(64)}`,
    hardware: {
      model: '751-9301',
      platform: 'linux/arm/v7',
      firmwareBaseline: '31',
      profile: 'cc100-751-9301-fw31-digital-v1',
    },
  },
};
const principal = { userId: 7, authenticationMethod: 'session' as const };

describe('managed enrolment and durable credential lifecycle', () => {
  let db: DataSource;
  let service: WagoManagedRuntimeService;
  let encrypt: jest.Mock;
  let decrypt: jest.Mock;
  let audit: jest.Mock;
  let rootProbe: jest.Mock;
  const session = (id = 1) =>
    Object.assign(new WagoCommissioningSession(), {
      id,
      targetHost: '10.77.0.7',
      hostKeyFingerprint: `SHA256:${'a'.repeat(43)}`,
      hardwareId: `cc100-${id}`,
    });

  beforeEach(async () => {
    db = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [
        WagoManagedAccess,
        WagoRuntimeUpdateEntity,
        WagoDeviceOperation,
        WagoController,
        WagoCommissioningSession,
      ],
      synchronize: true,
    }).initialize();
    const key = randomBytes(32);
    encrypt = jest.fn((plaintext: string) => {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key, iv);
      return Buffer.concat([iv, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]).toString('base64');
    });
    decrypt = jest.fn((envelope: string) => {
      const bytes = Buffer.from(envelope, 'base64'),
        cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(-16));
      return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString();
    });
    audit = jest.fn(async () => ({ status: 'recorded' }));
    const context = {
      getRepository: (entity: never) => db.getRepository(entity),
      secrets: { encrypt, decrypt },
      audit: { record: audit },
      logger: { warn: jest.fn() },
    } as unknown as PluginContext;
    service = new WagoManagedRuntimeService(
      context,
      {
        registerRuntimeStatusHandler: jest.fn(),
        getSettings: async () => ({ operationalPrefix: 'attraccess/wago' }),
      } as unknown as WagoService,
      { current: async () => artifact } as WagoRuntimeArtifactsService,
      {} as unknown as WagoCommissioningReadiness,
    );
    service.onApplicationBootstrap();
    rootProbe = jest.fn(async () => true);
    service.registerRootProbe(rootProbe);
    jest
      .mocked(managedSsh)
      .mockImplementation(async (_access, _key, header) =>
        header.startsWith('proof ') ? `OK ${header.split(' ')[1]}\n` : 'OK\n',
      );
  });
  afterEach(async () => {
    service.onModuleDestroy();
    await new Promise(setImmediate);
    await db.destroy();
    jest.clearAllMocks();
  });

  it('persists authenticated ciphertext before remote mutation and rotates per enrolment', async () => {
    const execute = jest.fn(async (_script: string) => {
      const rows = await db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access');
      expect(rows[0].encrypted_credentials).not.toContain('PRIVATE KEY');
      expect(JSON.parse(decrypt(rows[0].encrypted_credentials))).toMatchObject({ sessionId: 1 });
      return 'OK\n';
    });
    await service.enrol(session(), execute, new AbortController().signal);
    await service.enrol(session(2), async () => 'OK\n', new AbortController().signal);
    const rows = await db.query(
      'SELECT encrypted_credentials, key_fingerprint FROM plugin_wago_managed_access ORDER BY session_id',
    );
    const first = JSON.parse(decrypt(rows[0].encrypted_credentials)),
      second = JSON.parse(decrypt(rows[1].encrypted_credentials));
    expect(first.privateKey).not.toEqual(second.privateKey);
    expect(first.recoveryPassword).not.toEqual(second.recoveryPassword);
    expect(rootProbe).toHaveBeenCalledWith(session().targetHost, session().hostKeyFingerprint, first.recoveryPassword);
    expect(await db.getRepository(WagoManagedAccess).findOneByOrFail({ sessionId: 1 })).not.toHaveProperty(
      'encryptedCredentials',
    );
    expect(await service.recoverPassword(1, principal)).toEqual({ password: first.recoveryPassword });
    expect(await service.status(100)).toEqual({
      sessionId: null,
      management: 'reenrol_required',
      keyFingerprint: null,
      update: null,
      physicalQualification: 'unverified',
    });
  });

  it('does not mutate remotely when encryption fails or returns plaintext', async () => {
    encrypt.mockImplementation((plaintext) => plaintext);
    const execute = jest.fn();
    await expect(service.enrol(session(), execute, new AbortController().signal)).rejects.toThrow('encryption');
    expect(execute).not.toHaveBeenCalled();
    expect(await db.getRepository(WagoManagedAccess).count()).toBe(0);
  });

  it('verifies the encrypted database round trip and fails before remote changes when storage is corrupt', async () => {
    const repository = db.getRepository(WagoManagedAccess);
    const save = repository.save.bind(repository);
    jest.spyOn(repository, 'save').mockImplementationOnce(async (value) => {
      const row = await save(value);
      await repository.update(1, { encryptedCredentials: 'corrupted-ciphertext' });
      return row;
    });
    const execute = jest.fn();
    await expect(service.enrol(session(), execute, new AbortController().signal)).rejects.toThrow('unavailable');
    expect(execute).not.toHaveBeenCalled();
    expect(managedSsh).not.toHaveBeenCalled();
  });

  it('retains the pending identity after lost key cleanup and retries without generating replacement secrets', async () => {
    jest.mocked(managedSsh).mockImplementation(async (_access, _key, header) => {
      if (header.startsWith('access-key-commit')) {
        expect(await db.getRepository(WagoManagedAccess).findOneByOrFail({ sessionId: 1 })).toMatchObject({
          state: 'verified',
        });
        throw new Error('lost receipt');
      }
      return `OK ${header.split(' ')[1]}\n`;
    });
    await expect(service.enrol(session(), async () => 'OK\n', new AbortController().signal)).rejects.toThrow(
      'requires recovery',
    );
    const before = (await db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access'))[0]
      .encrypted_credentials;
    jest
      .mocked(managedSsh)
      .mockImplementation(async (_access, _key, header) =>
        header.startsWith('proof ') ? `OK ${header.split(' ')[1]}\n` : 'OK\n',
      );
    await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
    expect(
      (await db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access'))[0].encrypted_credentials,
    ).toBe(before);
  });

  it('retains recovery intent on failed second key connection without disabling SSH policy', async () => {
    jest.mocked(managedSsh).mockRejectedValue(new Error('transport output with fixture secret'));
    const execute = jest.fn(async (_script: string) => 'OK\n');
    await expect(service.enrol(session(), execute, new AbortController().signal)).rejects.toThrow('requires recovery');
    expect(await db.getRepository(WagoManagedAccess).findOneByOrFail({ sessionId: 1 })).toMatchObject({
      state: 'recovery_required',
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).not.toContain('dropbear restart');
    expect(rootProbe).not.toHaveBeenCalled();
  });

  it('requires a recorded administrator audit before decrypting/disclosing root recovery', async () => {
    await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
    decrypt.mockClear();
    audit.mockResolvedValue({ status: 'unavailable' });
    await expect(service.recoverPassword(1, principal)).rejects.toThrow('Durable audit');
    expect(decrypt).not.toHaveBeenCalled();
    expect(JSON.stringify(audit.mock.calls)).not.toContain('PRIVATE KEY');
    audit.mockResolvedValue({ status: 'recorded' });
    const result = await service.recoverPassword(1, principal);
    expect(result).toEqual({ password: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    expect(result).not.toHaveProperty('privateKey');
  });

  it('rejects encrypted envelopes copied to another controller/session', async () => {
    await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
    await db.getRepository(WagoManagedAccess).update(1, { fingerprint: `SHA256:${'b'.repeat(43)}` });
    await expect(service.recoverPassword(1, principal)).rejects.toThrow('does not match');
  });

  it('shares device ownership across processes and fences expired owners without releasing a successor', async () => {
    const first = new WagoDeviceOperations(db.getRepository(WagoDeviceOperation));
    const second = new WagoDeviceOperations(db.getRepository(WagoDeviceOperation));
    expect(await first.acquire('device-a', 'commissioning', 100, 200)).toBe(true);
    expect(await second.acquire('device-a', 'update', 150, 300)).toBe(false);
    expect(await second.acquire('device-b', 'update-b', 150, 300)).toBe(true);
    await expect(first.assertOwned('device-a', 'commissioning', 201)).rejects.toThrow('ownership');
    expect(await second.acquire('device-a', 'successor', 201, 400)).toBe(true);
    await first.release('device-a', 'commissioning');
    expect(await first.acquire('device-a', 'third', 202, 500)).toBe(false);
  });

  it('automatically reconciles a committed cutover after losing the SSH commit response', async () => {
    const current = await db.getRepository(WagoController).save(
      Object.assign(new WagoController(), {
        id: 1,
        hardwareId: 'cc100-1',
        trustState: 'claimed',
        mqttServerId: 7,
        pairingCodeHash: 'fixture',
        protocolVersion: '1',
        runtimeVersion: '1',
        capabilities: '[]',
        lastSeenAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );
    await db.getRepository(WagoCommissioningSession).save(
      Object.assign(session(), {
        mqttServerId: 7,
        firmwareBaseline: '31',
        state: 'awaiting_verification',
        initiatingPrincipal: JSON.stringify(principal),
        deliveryToken: 'a'.repeat(32),
        dockerProvisionToken: 'a'.repeat(32),
        auditLog: '[]',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );
    await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
    await db.getRepository(WagoManagedAccess).update(1, { controllerId: 1, state: 'recovery_required' });
    const now = Date.now();
    service['heartbeats'].set(1, { imageId: artifact.imageId, streamId: 'boot-new', timestamp: now, receivedAt: now });
    service['readiness'].observe = jest.fn(() => ({
      timestamp: now,
      streamId: 'boot-new',
      sequence: 1,
      revision: 1,
      contentHash: 'a'.repeat(64),
      connected: true,
      configurationAccepted: true,
      hardwareAvailable: true,
      ready: true,
    }));
    jest.mocked(commissioningVerification).mockResolvedValue({
      controllerId: 1,
      permanentConnection: true,
      enrollmentRevoked: true,
      configurationApplied: true,
      hardwareReadiness: 'ready',
      managementHardening: 'unverified',
      physicalQualification: 'required',
      ready: false,
    });
    rootProbe.mockResolvedValue(false);
    jest
      .mocked(managedSsh)
      .mockImplementation(async (_access, _key, header) =>
        header.startsWith('access-status ')
          ? 'committed\n'
          : header.startsWith('proof ')
            ? `OK ${header.split(' ')[1]}\n`
            : 'OK\n',
      );
    expect(await service['completeEnrolment'](current)).toBe(true);
    expect(await db.getRepository(WagoManagedAccess).findOneByOrFail({ sessionId: 1 })).toMatchObject({
      state: 'managed',
    });
    expect(await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).toMatchObject({
      state: 'completed',
      deliveryToken: null,
    });
    expect(jest.mocked(managedSsh).mock.calls.map((call) => call[2])).not.toContain(
      expect.stringMatching(/^access-cutover/),
    );
    const securityEvents = audit.mock.calls
      .map((call) => call[0])
      .filter((event) => event.action === 'wago.commissioning.security_apply');
    expect(securityEvents.map((event) => event.outcome)).toEqual(['attempted', 'succeeded']);
    expect(securityEvents[0].operationId).toBe(securityEvents[1].operationId);
  });

  it('uses the bound identity after restart despite a newer unused session, publishing installer changes and updating with only the stored key', async () => {
    await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
    const now = new Date().toISOString();
    const current = await db.getRepository(WagoController).save(
      Object.assign(new WagoController(), {
        id: 1,
        hardwareId: 'cc100-1',
        trustState: 'claimed',
        mqttServerId: 7,
        pairingCodeHash: 'fixture',
        protocolVersion: '1',
        runtimeVersion: '1',
        capabilities: '[]',
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    );
    for (const [id, state] of [
      [1, 'completed'],
      [2, 'awaiting_confirmation'],
    ] as const)
      await db.getRepository(WagoCommissioningSession).save(
        Object.assign(session(id), {
          hardwareId: current.hardwareId,
          mqttServerId: 7,
          firmwareBaseline: '31',
          state,
          initiatingPrincipal: JSON.stringify(principal),
          auditLog: '[]',
          createdAt: now,
          updatedAt: now,
        }),
      );
    await db.getRepository(WagoManagedAccess).update(1, { controllerId: 1, state: 'managed' });
    const envelope = (
      await db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access WHERE session_id = 1')
    )[0].encrypted_credentials;
    const credentials = JSON.parse(decrypt(envelope));
    service.onModuleDestroy();
    let heartbeat: Parameters<WagoService['registerRuntimeStatusHandler']>[0] = () => undefined;
    let boot = '00000000-0000-4000-8000-000000000001';
    let sequence = 1;
    const restarted = new WagoManagedRuntimeService(
      service['context'],
      {
        registerRuntimeStatusHandler: (handler) => {
          heartbeat = handler;
        },
        getSettings: async () => ({ operationalPrefix: 'attraccess/wago' }),
      } as WagoService,
      {
        current: async () => artifact,
        acquire: async () => ({ path: '/mock/build-owned-bundle', cleanup: jest.fn() }),
      } as unknown as WagoRuntimeArtifactsService,
      {
        observe: () => ({
          timestamp: Date.now(),
          streamId: boot,
          sequence,
          revision: 1,
          contentHash: 'a'.repeat(64),
          connected: true,
          configurationAccepted: true,
          hardwareAvailable: true,
          ready: true,
        }),
      } as unknown as WagoCommissioningReadiness,
    );
    let installed = '0'.repeat(64);
    const oldImage = `sha256:${'0'.repeat(64)}`;
    jest.mocked(managedSsh).mockImplementation(async (_access, key, header, _signal, payload) => {
      expect(key).toBe(credentials.privateKey);
      if (header.startsWith('inspect ')) return `${MANAGED_HELPER_PROTOCOL}\n${installed}\n${oldImage} true\n`;
      if (header.startsWith('installer-publish ')) {
        const source = (payload as Buffer).toString();
        expect(source).toBe(managedHostHelper(artifact));
        installed = createHash('sha256').update(source).digest('hex');
        expect(header).toBe(
          `installer-publish ${credentials.token} ${installed} ${Buffer.byteLength(source)} ${signInstaller(credentials.installerPrivateKey, credentials.token, source)}`,
        );
      }
      if (header.startsWith('activate ')) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        boot = '00000000-0000-4000-8000-000000000002';
        heartbeat(1, {
          imageId: artifact.imageId,
          streamId: boot,
          sequence: ++sequence,
          timestamp: Date.now(),
          receivedAt: Date.now(),
        });
      }
      return 'OK\n';
    });
    rootProbe.mockClear();
    restarted.onApplicationBootstrap();
    heartbeat(1, { imageId: oldImage, streamId: boot, sequence, timestamp: Date.now(), receivedAt: Date.now() });
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        const status = await restarted.status(1);
        if (status.update?.phase === 'current' && status.update.token === null) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(await restarted.status(1)).toMatchObject({
        management: 'managed',
        update: { phase: 'current', token: null, desiredImageId: artifact.imageId },
      });
      expect(rootProbe).not.toHaveBeenCalled();
      expect(jest.mocked(managedSsh).mock.calls.map((call) => call[2].split(' ')[0])).toEqual(
        expect.arrayContaining(['installer-publish', 'stage', 'activate', 'accept', 'acknowledge']),
      );
      expect(
        (await db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access WHERE session_id = 1'))[0]
          .encrypted_credentials,
      ).toBe(envelope);
    } finally {
      restarted.onModuleDestroy();
      await new Promise(setImmediate);
    }
  });
});

describe('fixed managed executor and recovery programs', () => {
  it('uses the same RTU contract in stage, activation, acceptance and recovery, and preserves fixed diagnostic categories', () => {
    const helper = managedHostHelper({
      ...artifact,
      manifest: {
        ...artifact.manifest,
        hardware: { ...artifact.manifest.hardware, profile: 'cc100-751-9301-fw31-digital-rtu-v1' },
      },
    });
    const comparisons = [...helper.matchAll(/cat "\$tx\/profile"\)" = '([^']+)'/g)].map((entry) => entry[1]);
    expect(comparisons).toHaveLength(5);
    expect(new Set(comparisons)).toEqual(new Set(['cc100-751-9301-fw31-digital-rtu-v1']));
    expect(managedSshFailure('Insufficient update journal storage', 'transfer')).toBe('storage');
    expect(managedSshFailure('Runtime load failed', 'transfer')).toBe('load');
    expect(managedSshFailure('codesys-boot-enabled', 'transfer')).toBe('host_gate');
    expect(managedSshFailure('unexpected remote fixture-secret text', 'transfer')).toBe('transfer');
  });
  it('provisions unique scoped access and restores the previous SSH policy on interrupted cutover/reboot', () => {
    const fixture = fw31ShellFixture();
    try {
      const node = (name: string, source: string) =>
        fixture.file(`bin/${name}`, `#!${process.execPath}\n${source}`, 0o700);
      fixture.file('accounts.json', JSON.stringify({ root: { uid: 0, gid: 0, home: '/root' } }));
      fixture.file('groups.json', JSON.stringify({ root: 0 }));
      node(
        'id',
        `const fs=require('fs'),r=process.env.FIXTURE_ROOT,a=JSON.parse(fs.readFileSync(r+'/accounts.json')),args=process.argv.slice(2),u=a[args[0]?.startsWith('-')?(args[1]||'root'):(args[0]||'root')];if(!u)process.exit(1);if(args[0]==='-u')console.log(u.uid);else if(args[0]==='-g')console.log(u.gid);`,
      );
      node(
        'getent',
        `const fs=require('fs'),r=process.env.FIXTURE_ROOT,args=process.argv.slice(2),groups=JSON.parse(fs.readFileSync(r+'/groups.json')),accounts=JSON.parse(fs.readFileSync(r+'/accounts.json'));if(args[0]==='group'){if(groups[args[1]]===undefined)process.exit(2);console.log(args[1]+':x:'+groups[args[1]]+':');}else{for(const [name,u] of Object.entries(accounts)){if(!args[1]||args[1]===name)console.log(name+':x:'+u.uid+':'+u.gid+'::'+u.home+':/bin/sh');}}`,
      );
      node(
        'groupadd',
        `const fs=require('fs'),r=process.env.FIXTURE_ROOT,g=JSON.parse(fs.readFileSync(r+'/groups.json'));g.attraccess=1111;fs.writeFileSync(r+'/groups.json',JSON.stringify(g));`,
      );
      node(
        'useradd',
        `const fs=require('fs'),r=process.env.FIXTURE_ROOT,a=JSON.parse(fs.readFileSync(r+'/accounts.json'));a.attraccess={uid:1111,gid:1111,home:r+'/home/attraccess'};fs.writeFileSync(r+'/accounts.json',JSON.stringify(a));fs.mkdirSync(r+'/home/attraccess',{recursive:true,mode:0o700});`,
      );
      node(
        'chpasswd',
        `const fs=require('fs'),crypto=require('crypto'),r=process.env.FIXTURE_ROOT,text=fs.readFileSync(0,'utf8').trim().split(':'),file=r+'/password-hashes.json',hashes=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{};hashes[text[0]]=crypto.createHash('sha256').update(text[1]).digest('hex');fs.writeFileSync(file,JSON.stringify(hashes));`,
      );
      fixture.file('bin/cut', '#!/bin/sh\nexec /usr/bin/cut "$@"\n', 0o700);
      fixture.file('bin/sudo', '#!/bin/sh\nexit 0\n', 0o700);
      fixture.file('bin/visudo', '#!/bin/sh\nexit 0\n', 0o700);
      fixture.file('usr/sbin/dropbear', '#!/bin/sh\necho "Dropbear v2025.88"\n', 0o700);
      fixture.file('etc/sudoers.d/fixture', '');
      fixture.file('etc/init.d/dropbear', '#!/bin/sh\nprintf old-policy >> "$FIXTURE_ROOT/ssh-restarts"\n', 0o755);
      const token = 'a'.repeat(32),
        key = generateManagementKey(),
        password = 'b'.repeat(43);
      const success = (result: ReturnType<typeof fixture.run>) =>
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
      success(
        fixture.run(
          managedProvisionScript(
            token,
            key.publicKey,
            password,
            managedHostHelper(artifact, fixture.root),
            fixture.root,
          ),
        ),
      );
      expect(fixture.read('home/attraccess/.ssh/authorized_keys')).toContain(
        `command="${fixture.root}/usr/bin/sudo -n ${fixture.root}/usr/sbin/attraccess-wago-management"`,
      );
      expect(fixture.read('etc/sudoers.d/attraccess-wago')).toContain('NOPASSWD:');
      const hashes = JSON.parse(fixture.read('password-hashes.json'));
      expect(hashes.root).toBe(createHash('sha256').update(password).digest('hex'));
      expect(hashes.attraccess).not.toBe(hashes.root);
      // Re-enrolment stages an additional key; cleanup only follows a fresh
      // key-only proof persisted by the server. Both old and new work meanwhile.
      const replacement = generateManagementKey();
      success(
        fixture.run(
          managedProvisionScript(
            token,
            replacement.publicKey,
            password,
            managedHostHelper(artifact, fixture.root),
            fixture.root,
          ),
        ),
      );
      expect(fixture.read('home/attraccess/.ssh/authorized_keys')).toContain(key.publicKey);
      expect(fixture.read('home/attraccess/.ssh/authorized_keys')).toContain(replacement.publicKey);
      success(fixture.run(managedHostHelper(artifact, fixture.root), '', Buffer.from(`access-key-commit ${token}\n`)));
      expect(fixture.read('home/attraccess/.ssh/authorized_keys')).not.toContain(key.publicKey);
      expect(fixture.read('home/attraccess/.ssh/authorized_keys')).toContain(replacement.publicKey);
      success(fixture.run(managedHostHelper(artifact, fixture.root), '', Buffer.from(`access-key-commit ${token}\n`)));
      success(fixture.run(managedCutoverScript(token, fixture.root)));
      expect(fixture.read('etc/init.d/dropbear')).toContain('-G attraccess -w -s');
      success(fixture.run(`set -- boot\n${managedWatchdogScript(fixture.root)}`));
      expect(fixture.read('etc/init.d/dropbear')).not.toContain('-G attraccess');
      // Retrying with the same verified generated identity must survive a second cutover.
      success(fixture.run(managedCutoverScript(token, fixture.root)));
      success(fixture.run(managedCommitScript(token, fixture.root)));
      success(fixture.run(`set -- boot\n${managedWatchdogScript(fixture.root)}`));
      expect(fixture.read('etc/init.d/dropbear')).toContain('-G attraccess -w -s');
      expect(fixture.read('password-hashes.json')).not.toContain(password);
    } finally {
      fixture.dispose();
    }
  });
  it('accepts real commissioning journals in dependency order and fences foreign tokens before cleanup', () => {
    const fixture = fw31ShellFixture();
    try {
      fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
      const token = 'a'.repeat(32);
      const success = (result: ReturnType<typeof fixture.run>) =>
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
      fixture.file('bundle/image-reference', artifact.image + '\n');
      fixture.file('bundle/image.tar', 'compressed fixture image');
      const archive = join(fixture.root, 'tmp/install.tar');
      expect(
        spawnSync('/usr/bin/tar', ['-cf', archive, '-C', join(fixture.root, 'bundle'), 'image-reference', 'image.tar'])
          .status,
      ).toBe(0);
      const bundle = readFileSync(archive);
      fixture.file('etc/attraccess-wago/docker-provision/token', token + '\n');
      fixture.file('etc/attraccess-wago/docker-provision/mode', 'destructive\n');
      fixture.file('etc/attraccess-wago/docker-provision/started', '');
      success(
        fixture.run(
          runtimeBundleDeliveryScript(
            artifact.image,
            'MQTT=permanent',
            null,
            bundle.length,
            createHash('sha256').update(bundle).digest('hex'),
            token,
            fixture.root,
          ),
          '',
          bundle,
        ),
      );
      const helper = managedHostHelper(artifact, fixture.root);
      expect(fixture.run(helper, '', Buffer.from(`commissioning-accept ${'b'.repeat(32)}\n`)).status).not.toBe(0);
      expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-install-transaction/started'))).toBe(true);
      success(fixture.run(helper, '', Buffer.from(`commissioning-accept ${token}\n`)));
      expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-install-transaction'))).toBe(false);
      expect(existsSync(join(fixture.root, `etc/attraccess-wago/docker-provision.completed-${token}/accepted`))).toBe(
        true,
      );
      success(fixture.run(helper, '', Buffer.from(`commissioning-accept ${token}\n`)));
      expect(fixture.containers()[0]).toMatchObject({ running: true });
      expect(fixture.read('etc/attraccess-wago/runtime.env')).toBe('MQTT=permanent');
    } finally {
      fixture.dispose();
    }
  });
  it('executes a full repeated image update through only the fixed dispatcher, preserving enrolled state', () => {
    const fixture = fw31ShellFixture();
    try {
      fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
      fixture.file('etc/attraccess-wago/runtime.env', 'WAGO_MQTT_PASSWORD=permanent-fixture-secret');
      fixture.file('etc/attraccess-wago/runtime-enabled', '');
      fixture.file('etc/attraccess-wago/install.lock', '');
      fixture.file('var/lib/attraccess-wago/state.json', 'enrolled-state');
      fixture.file(
        'owners.json',
        JSON.stringify({ ...JSON.parse(fixture.read('owners.json')), '/var/lib/attraccess-wago': '10001:10001' }),
      );
      fixture.setContainers([
        {
          id: 'old-id',
          name: 'attraccess-wago',
          running: true,
          restart: 'no',
          imageId: `sha256:${'9'.repeat(64)}`,
          mounts: [fixture.root + WAGO_DIN, fixture.root + WAGO_DOUT],
        },
      ]);
      fixture.file('loaded-image-id', artifact.imageId);
      fixture.file('bundle/image-reference', artifact.image + '\n');
      fixture.file('bundle/image.tar', 'compressed image fixture');
      const file = join(fixture.root, 'tmp/update.tar');
      expect(
        spawnSync('/usr/bin/tar', ['-cf', file, '-C', join(fixture.root, 'bundle'), 'image-reference', 'image.tar'])
          .status,
      ).toBe(0);
      const bundle = readFileSync(file),
        digest = createHash('sha256').update(bundle).digest('hex');
      const helper = managedHostHelper(artifact, fixture.root),
        token = '5'.repeat(32);
      const run = (header: string, bytes = Buffer.alloc(0)) =>
        fixture.run(helper, '', Buffer.concat([Buffer.from(header + '\n'), bytes]));
      const success = (result: ReturnType<typeof run>) =>
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
      success(run(`proof ${token}`));
      expect(run(`stage ${token} ${digest} ${bundle.length} ${artifact.imageId} arbitrary-image`).status).not.toBe(0);
      success(run(`stage ${token} ${digest} ${bundle.length} ${artifact.imageId} ${artifact.image}`, bundle));
      expect(run(`activate ${'6'.repeat(32)}`).status).not.toBe(0);
      success(run(`activate ${token}`));
      success(run(`accept ${token}`));
      success(run(`acknowledge ${token}`));
      success(run(`acknowledge ${token}`));
      expect(fixture.read('var/lib/attraccess-wago/state.json')).toBe('enrolled-state');
      expect(fixture.read('etc/attraccess-wago/runtime.env')).toContain('permanent-fixture-secret');
      expect(fixture.containers()).toHaveLength(1);
      expect(fixture.containers()[0]).toMatchObject({ imageId: artifact.imageId, running: true });
    } finally {
      fixture.dispose();
    }
  });
  it('generates valid POSIX shell with dynamic bounded artifact parameters, no supplied scripts/eval', () => {
    const helper = managedHostHelper(artifact);
    const key = generateManagementKey();
    for (const script of [
      helper,
      managedProvisionScript('a'.repeat(32), key.publicKey, 'b'.repeat(43), helper),
      managedCutoverScript('a'.repeat(32)),
      managedCommitScript('a'.repeat(32)),
      managedAccessWatchdog,
    ]) {
      const result = spawnSync('/bin/sh', ['-n'], { input: script, encoding: 'utf8' });
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    }
    expect(helper).toContain('head -c "$((bytes + 1))"');
    expect(helper).toContain('journal_required=$((2 * kib + 16384))');
    expect(helper).toContain('"${token}"');
    expect(helper).not.toMatch(/\beval\b|\b1234567\b|'\$\{token\}'/);
    expect(helper).toContain('*) exit 1 ;;');
  });

  it('migrates credential/update/operation storage together and refuses destructive downgrade with credentials', async () => {
    const db = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [WagoManagedAccess, WagoRuntimeUpdateEntity, WagoDeviceOperation],
      migrations: [WagoManagedUpdates1780010650000],
    }).initialize();
    try {
      await db.runMigrations();
      await db.query(
        "INSERT INTO plugin_wago_managed_access VALUES (1, NULL, '10.0.0.1', 'pin', 'token', 'pending', 'ciphertext', 'key-pin')",
      );
      await expect(db.undoLastMigration()).rejects.toThrow('Retire managed');
    } finally {
      await db.destroy();
    }
  });
});
