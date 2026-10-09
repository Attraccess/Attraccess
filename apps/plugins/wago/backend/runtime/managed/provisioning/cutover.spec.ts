import { PluginContext } from '@attraccess/plugins-backend-sdk';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { BuildRuntimeArtifact } from '../../artifacts/build';
import { WagoCommissioningReadiness } from '../../../commissioning/readiness/readiness';
import { WagoCommissioningSession } from '../../../commissioning/sessions/session.entity';
import { commissioningVerification } from '../../../commissioning/sessions/verification';
import { WagoController } from '../../../controllers/entity';
import { initializeCutover } from '../../../wago-cutover.setup.test-fixture';
import { WagoManagedAccess } from '../access.entity';
import { managedHostHelper } from './helper';
import { MANAGED_HELPER_PROTOCOL, signInstaller } from './installer';
import { WagoManagedRuntimeService } from '../service';
import { resetTestFixture } from '../setup.test-fixture';
import { managedSsh } from '../transport/ssh';
import { WagoRuntimeArtifactsService } from '../../artifacts/catalog';
import { RuntimeUpdateError } from '../../update/coordinator';
import { WagoService } from '../../../controllers/service';

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

jest.mock('@attraccess/plugins-backend-sdk', () => jest.requireActual('typeorm'));

jest.mock('../../../controllers/service', () => ({ WagoService: class {} }));

jest.mock('../../artifacts/catalog', () => ({ WagoRuntimeArtifactsService: class {} }));

jest.mock('../../../commissioning/readiness/readiness', () => ({ WagoCommissioningReadiness: class {} }));

jest.mock('../transport/ssh', () => ({ ...jest.requireActual('../transport/ssh'), managedSsh: jest.fn() }));

jest.mock('../../../commissioning/sessions/verification', () => ({ commissioningVerification: jest.fn() }));

describe('managed cutover and reboot evidence', () => {
  let db: DataSource;

  let service: WagoManagedRuntimeService;

  let encrypt: jest.Mock;

  let decrypt: jest.Mock;

  let audit: jest.Mock;

  let rootProbe: jest.Mock;

  let context: PluginContext;

  const session = (id = 1) =>
    Object.assign(new WagoCommissioningSession(), {
      id,
      targetHost: '10.77.0.7',
      hostKeyFingerprint: `SHA256:${'a'.repeat(43)}`,
      hardwareId: `cc100-${id}`,
    });

  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    await new Promise(setImmediate);
    await db.destroy();
    jest.clearAllMocks();
  });

  const scope = {
    get context() {
      return context;
    },
    set context(value: typeof context) {
      context = value;
    },
    get service() {
      return service;
    },
    set service(value: typeof service) {
      service = value;
    },
    get artifact() {
      return artifact;
    },
    get db() {
      return db;
    },
    set db(value: typeof db) {
      db = value;
    },
    get decrypt() {
      return decrypt;
    },
    set decrypt(value: typeof decrypt) {
      decrypt = value;
    },
    get session() {
      return session;
    },
    get rootProbe() {
      return rootProbe;
    },
    set rootProbe(value: typeof rootProbe) {
      rootProbe = value;
    },
    get principal() {
      return principal;
    },
    get encrypt() {
      return encrypt;
    },
    set encrypt(value: typeof encrypt) {
      encrypt = value;
    },
    get audit() {
      return audit;
    },
    set audit(value: typeof audit) {
      audit = value;
    },
  };

  it.each([
    'committed',
    'open',
    'new-server-runtime',
    'retiring',
    'slow-preparation',
    'slow-cutover',
    'acceptance-failed',
    'slow-policy',
    'bootstrap-acceptance',
    'stuck-cutover',
  ] as const)(
    'reconciles %s cutover with reboot proof before a new commit',
    async (remoteStatus) => {
      const current = await initializeCutover(scope, remoteStatus);
      const now = Date.now();
      service['heartbeats'].set(1, {
        imageId: artifact.imageId,
        streamId: 'boot-new',
        timestamp: now,
        receivedAt: now,
      });
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
      if (remoteStatus === 'retiring') {
        const operations = service['operations'];
        const acquire = operations.acquire.bind(operations);
        jest.spyOn(operations, 'acquire').mockImplementation(async (...args) => {
          await db.getRepository(WagoManagedAccess).update(1, { state: 'retiring' });
          return acquire(...args);
        });
        jest.mocked(managedSsh).mockClear();
        expect(await service['completeEnrolment'](current)).toBe(false);
        expect(jest.mocked(managedSsh)).not.toHaveBeenCalled();
        expect((await service.sessionStatus(1)).management).toBe('retiring');
        return;
      }
      const open =
        remoteStatus === 'new-server-runtime' ||
        remoteStatus === 'open' ||
        remoteStatus === 'slow-preparation' ||
        remoteStatus === 'slow-cutover' ||
        remoteStatus === 'acceptance-failed' ||
        remoteStatus === 'slow-policy' ||
        remoteStatus === 'bootstrap-acceptance';
      rootProbe.mockResolvedValue(open);
      const bootstrapAcceptance = jest.fn(async (_host, _fingerprint, _password, _token, guard) => {
        await guard.assertOwned();
        expect(guard.signal.aborted).toBe(false);
      });
      if (remoteStatus === 'bootstrap-acceptance') service.registerPreparationAcceptance(bootstrapAcceptance);
      let preparationStarted!: () => void;
      let cutoverStarted!: () => void;
      let rebootStarted!: () => void;
      let policyStarted!: () => void;
      const preparing = new Promise<void>((resolve) => {
        preparationStarted = resolve;
      });
      const cuttingOver = new Promise<void>((resolve) => {
        cutoverStarted = resolve;
      });
      const rebooting = new Promise<void>((resolve) => {
        rebootStarted = resolve;
      });
      const checkingPolicy = new Promise<void>((resolve) => {
        policyStarted = resolve;
      });
      let slowStepAborted = false;
      let boot = '00000000-0000-4000-8000-000000000001\n';
      jest.mocked(managedSsh).mockImplementation(async (_access, _key, header, signal) => {
        if (header.startsWith('access-status '))
          return (open ? 'open' : remoteStatus === 'stuck-cutover' ? 'cutover' : remoteStatus) + '\n';
        if (remoteStatus === 'stuck-cutover' && header.startsWith('access-restore '))
          throw new RuntimeUpdateError('lock_tools');
        if (remoteStatus === 'slow-preparation' && header.startsWith('access-key-commit ')) {
          preparationStarted();
          await new Promise((resolve) => setTimeout(resolve, 200_000));
          slowStepAborted = signal.aborted;
          signal.throwIfAborted();
        }
        if (remoteStatus === 'slow-policy' && header.startsWith('access-policy ')) {
          policyStarted();
          await new Promise((resolve) => setTimeout(resolve, 200_000));
          signal.throwIfAborted();
        }
        if (remoteStatus === 'acceptance-failed' && header.startsWith('commissioning-accept '))
          throw new Error('internal detail with a secret must not be persisted');
        if (header.startsWith('access-cutover ')) {
          expect(await service.status(1)).toMatchObject({
            managementSetup: { state: 'running', reason: 'ssh_cutover' },
          });
          rootProbe.mockResolvedValue(false);
          cutoverStarted();
          if (remoteStatus === 'slow-cutover') {
            await new Promise((resolve) => setTimeout(resolve, 200_000));
            slowStepAborted = signal.aborted;
            signal.throwIfAborted();
          }
        }
        if (header.startsWith('access-boot ')) return boot;
        if (header.startsWith('access-reboot ')) {
          expect(await service.status(1)).toMatchObject({
            managementSetup: { state: 'running', reason: 'reboot' },
          });
          boot = '00000000-0000-4000-8000-000000000002\n';
          rebootStarted();
        }
        return header.startsWith('proof ') ? `OK ${header.split(' ')[1]}\n` : 'OK\n';
      });
      if (remoteStatus === 'new-server-runtime') {
        const oldImage = `sha256:${'0'.repeat(64)}`;
        const heartbeat = service['heartbeats'].get(1);
        if (!heartbeat) throw new Error('Missing enrollment heartbeat');
        heartbeat.imageId = oldImage;
        const publishPolicy = jest.fn(async (_id: number, desired: string, observed: string) => {
          service['readiness'].observe = jest.fn(() => ({
            timestamp: now,
            streamId: 'boot-new',
            sequence: 1,
            revision: 1,
            contentHash: 'a'.repeat(64),
            connected: true,
            configurationAccepted: true,
            hardwareAvailable: true,
            ready: desired === observed,
          }));
        });
        service['wago'].setRuntimePolicy = publishPolicy;
        service['wago'].blockRuntime = jest.fn();
        await service['refreshRuntimePolicy'](1);
        expect(publishPolicy).toHaveBeenLastCalledWith(1, oldImage, oldImage, undefined);
        expect(service['wago'].blockRuntime).toHaveBeenCalledWith(1);
      }
      if (remoteStatus === 'stuck-cutover') {
        expect(await service['completeEnrolment'](current)).toBe(false);
        expect(await service.status(1)).toMatchObject({
          management: 'recovery_required',
          managementFailure: expect.stringContaining('Automatic SSH setup failed (rollback).'),
        });
        expect((await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).failureReason).toContain(
          'lock option unsupported',
        );
        expect(jest.mocked(managedSsh).mock.calls.some((call) => call[2].startsWith('access-commit '))).toBe(false);
        return;
      }
      if (remoteStatus === 'acceptance-failed') {
        expect(await service['completeEnrolment'](current)).toBe(false);
        const failure = (await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).failureReason;
        expect(failure).toContain('Automatic SSH setup failed (acceptance).');
        expect(failure).toContain('retained transaction records');
        expect(failure).not.toContain('secret');
        expect(await service.status(1)).toMatchObject({
          management: 'recovery_required',
          managementFailure: failure,
        });
        expect(jest.mocked(managedSsh).mock.calls.some((call) => call[2].startsWith('access-cutover '))).toBe(false);
        // A transient offline status probe on the next scan must not replace
        // the useful failure from the last audited setup attempt.
        jest.mocked(managedSsh).mockRejectedValue(new RuntimeUpdateError('offline'));
        expect(await service['completeEnrolment'](current)).toBe(false);
        expect((await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).failureReason).toBe(
          failure,
        );
        jest.mocked(managedSsh).mockRejectedValue(new RuntimeUpdateError('host_identity'));
        expect(await service['completeEnrolment'](current)).toBe(false);
        expect((await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).failureReason).toContain(
          'SSH host key differs',
        );
        return;
      }
      if (remoteStatus === 'slow-policy') {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        try {
          const completion = service['completeEnrolment'](current);
          await cuttingOver;
          await jest.advanceTimersByTimeAsync(3000);
          await checkingPolicy;
          await jest.advanceTimersByTimeAsync(200_000);
          expect(await completion).toBe(false);
          expect(await service.status(1)).toMatchObject({
            management: 'recovery_required',
            managementFailure: expect.stringContaining('Automatic SSH setup failed (policy).'),
          });
          expect(jest.mocked(managedSsh).mock.calls.some((call) => call[2].startsWith('access-commit '))).toBe(false);
        } finally {
          jest.useRealTimers();
        }
        return;
      }
      if (remoteStatus === 'slow-preparation' || remoteStatus === 'slow-cutover') {
        // A legitimate supervisor gate can hold install.lock for up to 300s.
        // Waiting for it must not consume the later SSH rollback window.
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        try {
          const completion = service['completeEnrolment'](current);
          await (remoteStatus === 'slow-preparation' ? preparing : cuttingOver);
          await jest.advanceTimersByTimeAsync(200_000);
          if (slowStepAborted) {
            expect(await completion).toBe(true);
            return;
          }
          await cuttingOver;
          await jest.advanceTimersByTimeAsync(3000);
          await rebooting;
          await jest.advanceTimersByTimeAsync(1000);
          expect(await completion).toBe(true);
        } finally {
          jest.useRealTimers();
        }
      } else expect(await service['completeEnrolment'](current)).toBe(true);
      if (remoteStatus === 'bootstrap-acceptance') {
        expect(bootstrapAcceptance).toHaveBeenCalledTimes(1);
        expect(bootstrapAcceptance.mock.calls[0].slice(0, 2)).toEqual([
          session().targetHost,
          session().hostKeyFingerprint,
        ]);
        expect(bootstrapAcceptance.mock.calls[0][3]).toBe('a'.repeat(32));
        expect(jest.mocked(managedSsh).mock.calls.some((call) => call[2].startsWith('commissioning-accept '))).toBe(
          false,
        );
      }
      expect(await service.status(1)).not.toHaveProperty('managementSetup');
      expect(await db.getRepository(WagoManagedAccess).findOneByOrFail({ sessionId: 1 })).toMatchObject({
        state: 'managed',
      });
      expect(await db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: 1 })).toMatchObject({
        state: 'completed',
        deliveryToken: null,
      });
      if (remoteStatus === 'new-server-runtime') {
        await service['refreshRuntimePolicy'](1);
        expect(service['wago'].setRuntimePolicy).toHaveBeenLastCalledWith(
          1,
          artifact.imageId,
          `sha256:${'0'.repeat(64)}`,
          undefined,
        );
      }
      const commands = jest.mocked(managedSsh).mock.calls.map((call) => call[2].split(' ')[0]);
      if (remoteStatus === 'committed') expect(commands).not.toContain('access-cutover');
      else {
        expect(commands.indexOf('access-reboot')).toBeLessThan(commands.indexOf('access-commit'));
        expect(commands.filter((command) => command === 'access-boot')).toHaveLength(2);
      }
      const securityEvents = audit.mock.calls
        .map((call) => call[0])
        .filter((event) => event.action === 'wago.commissioning.security_apply');
      expect(securityEvents.map((event) => event.outcome)).toEqual(['attempted', 'succeeded']);
      expect(securityEvents[0].operationId).toBe(securityEvents[1].operationId);
    },
    15_000,
  );

  it.each(['fresh', 'stale', 'missing'] as const)(
    'updates with the bound SSH identity and a %s prior heartbeat after server restart',
    async (priorHeartbeat) => {
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
      await service.onModuleDestroy();
      let heartbeat: Parameters<WagoService['registerRuntimeStatusHandler']>[0] = () => undefined;
      let boot = '00000000-0000-4000-8000-000000000001';
      let sequence = 1;
      let policyConfirmed = false;
      const restarted = new WagoManagedRuntimeService(
        service['context'],
        {
          registerRuntimeStatusHandler: (handler) => {
            heartbeat = handler;
          },
          setRuntimePolicy: async (_id: number, desired: string, observed: string) => {
            policyConfirmed = desired === observed;
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
            ready: policyConfirmed,
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
          policyConfirmed = false;
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
      if (priorHeartbeat === 'fresh') {
        heartbeat(1, { imageId: oldImage, streamId: boot, sequence, timestamp: Date.now(), receivedAt: Date.now() });
      } else if (priorHeartbeat === 'stale') {
        restarted['heartbeats'].set(1, {
          imageId: oldImage,
          streamId: boot,
          timestamp: Date.now() - 120_000,
          receivedAt: Date.now() - 120_000,
        });
      }
      try {
        for (let attempt = 0; attempt < 100; attempt++) {
          const status = await restarted.status(1);
          if (status.update?.phase === 'current' && status.update.token === null) break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(await restarted.status(1)).toMatchObject({
          management: 'managed',
          runtime: {
            runningVersion: current.runtimeVersion,
            runningImageId: artifact.imageId,
            desiredVersion: artifact.manifest.runtimeVersion,
            desiredImageId: artifact.imageId,
          },
          update: {
            phase: 'current',
            token: null,
            desiredImageId: artifact.imageId,
            previousRuntimeVersion: current.runtimeVersion,
            desiredRuntimeVersion: artifact.manifest.runtimeVersion,
          },
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
        await restarted.onModuleDestroy();
        await new Promise(setImmediate);
      }
    },
  );

  it.each([
    'previous boot',
    'heartbeat before activation',
    'delivery before activation',
    'state before activation',
    'wrong image',
    'wrong state boot',
    'not ready',
    'unknown activation',
    'wrong activation target',
  ])('rejects %s as replacement readiness without relying on a live old runtime', async (invalidProof) => {
    await service.enrol(session(), async () => 'OK\n', new AbortController().signal);
    const timestamp = new Date().toISOString();
    await db.getRepository(WagoController).save(
      Object.assign(new WagoController(), {
        id: 1,
        hardwareId: 'cc100-1',
        trustState: 'claimed',
        mqttServerId: 7,
        pairingCodeHash: 'fixture',
        protocolVersion: '1.0.0',
        runtimeVersion: '0.2.0',
        capabilities: '[]',
        lastSeenAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    await db.getRepository(WagoManagedAccess).update(1, { controllerId: 1, state: 'managed' });
    const oldBoot = '00000000-0000-4000-8000-000000000001';
    const newBoot = '00000000-0000-4000-8000-000000000002';
    if (invalidProof === 'previous boot') {
      service['heartbeats'].set(1, {
        imageId: `sha256:${'0'.repeat(64)}`,
        streamId: oldBoot,
        timestamp: Date.now() - 120_000,
        receivedAt: Date.now() - 120_000,
      });
    }
    const host = service['updateHost']();
    const token = 'a'.repeat(32);
    const signal = new AbortController().signal;
    const beforeActivation = Date.now() - 1;
    await host.activate(1, token, artifact, signal);
    const fresh = Date.now() + 1000;
    const imageId = invalidProof === 'wrong activation target' ? `sha256:${'9'.repeat(64)}` : artifact.imageId;
    const streamId = invalidProof === 'previous boot' ? oldBoot : newBoot;
    service['heartbeats'].set(1, {
      imageId: invalidProof === 'wrong image' ? `sha256:${'0'.repeat(64)}` : imageId,
      streamId,
      timestamp: invalidProof === 'heartbeat before activation' ? beforeActivation : fresh,
      receivedAt: invalidProof === 'delivery before activation' ? beforeActivation : fresh,
    });
    const observe = jest.fn(() => ({
      timestamp: invalidProof === 'state before activation' ? beforeActivation : fresh,
      streamId: invalidProof === 'wrong state boot' ? oldBoot : streamId,
      sequence: 1,
      revision: 1,
      contentHash: 'a'.repeat(64),
      connected: true,
      configurationAccepted: true,
      hardwareAvailable: true,
      ready: invalidProof !== 'not ready',
    }));
    service['readiness'].observe = observe;
    clearInterval(service['timer']);
    service['timer'] = undefined;
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    jest.setSystemTime(fresh);
    try {
      const result = expect(
        host.verify(
          1,
          invalidProof === 'unknown activation' ? 'b'.repeat(32) : token,
          imageId,
          beforeActivation - 60_000,
          signal,
        ),
      ).rejects.toMatchObject({ failure: 'readiness' });
      // SQLite completes outside the fake clock. Wait for the first readiness
      // observation before advancing the verification deadline.
      while (!observe.mock.calls.length) {
        await new Promise(setImmediate);
      }
      await jest.advanceTimersByTimeAsync(120_000);
      await result;
    } finally {
      jest.useRealTimers();
    }
  });
});
