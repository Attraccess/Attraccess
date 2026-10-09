import { BuildRuntimeArtifact } from '../artifacts/build';
import {
  ManagedRuntimeUpdateHost,
  RuntimeUpdateError,
  RuntimeUpdateRecord,
  RuntimeUpdateStore,
  WagoRuntimeUpdateCoordinator,
} from './coordinator';
import { resetTestFixture } from './coordinator.setup.test-fixture';

function release(id: string): BuildRuntimeArtifact {
  return {
    buildId: id.repeat(40),
    imageId: `sha256:${id.repeat(64)}`,
    digest: id.repeat(64),
    bytes: 8192,
    image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${id.repeat(64)}`,
    manifest: {
      schemaVersion: 1,
      runtime: 'attraccess-wago-cc100',
      runtimeVersion: '0.1.0',
      protocolVersion: '1.0.0',
      image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${id.repeat(64)}`,
      hardware: {
        model: '751-9301',
        platform: 'linux/arm/v7',
        firmwareBaseline: '31',
        profile: 'cc100-751-9301-fw31-digital-v1',
      },
    },
  };
}

describe('durable managed runtime reconciliation', () => {
  let now: number;
  let desired: BuildRuntimeArtifact;
  let rows: Map<number, RuntimeUpdateRecord>;
  let owners: Map<number, string>;
  let store: RuntimeUpdateStore;
  let host: jest.Mocked<ManagedRuntimeUpdateHost>;
  let audit: jest.Mock;
  let coordinator: WagoRuntimeUpdateCoordinator;
  beforeEach(() => {
    resetTestFixture(scope);
  });
  afterEach(() => coordinator.stop());
  const scope = {
    get coordinator() {
      return coordinator;
    },
    set coordinator(value: typeof coordinator) {
      coordinator = value;
    },
    get host() {
      return host;
    },
    set host(value: typeof host) {
      host = value;
    },
    get release() {
      return release;
    },
    get desired() {
      return desired;
    },
    set desired(value: typeof desired) {
      desired = value;
    },
    get rows() {
      return rows;
    },
    set rows(value: typeof rows) {
      rows = value;
    },
    get now() {
      return now;
    },
    set now(value: typeof now) {
      now = value;
    },
    get store() {
      return store;
    },
    set store(value: typeof store) {
      store = value;
    },
    get audit() {
      return audit;
    },
    set audit(value: typeof audit) {
      audit = value;
    },
    get owners() {
      return owners;
    },
    set owners(value: typeof owners) {
      owners = value;
    },
  };

  it('updates immediately when a fresh heartbeat contradicts a current checkpoint', async () => {
    await coordinator.reconcile(1);
    host.inspect.mockClear();
    await coordinator.reconcile(1, false, release('a').imageId);
    expect(host.inspect).toHaveBeenCalledTimes(1);
    expect(host.activate).toHaveBeenCalledTimes(2);
  });

  it('retains before/after versions across completion, an inspection failure and current-image rechecks', async () => {
    desired = { ...desired, manifest: { ...desired.manifest, runtimeVersion: '0.2.0' } };
    host.inspect.mockResolvedValue({
      imageId: release('a').imageId,
      runtimeVersion: '0.1.0',
      managed: true,
      claimed: true,
      compatible: true,
      online: true,
    });
    await coordinator.reconcile(1);
    expect(rows.get(1)).toMatchObject({
      phase: 'current',
      previousRuntimeVersion: '0.1.0',
      desiredRuntimeVersion: '0.2.0',
      previousImageId: release('a').imageId,
    });
    host.inspect.mockRejectedValueOnce(new RuntimeUpdateError('offline'));
    now = rows.get(1)?.retryAt ?? now;
    await coordinator.reconcile(1);
    expect(rows.get(1)).toMatchObject({
      phase: 'blocked',
      previousRuntimeVersion: '0.1.0',
      previousImageId: release('a').imageId,
    });
    host.inspect.mockResolvedValue({
      imageId: desired.imageId,
      runtimeVersion: '0.2.0',
      managed: true,
      claimed: true,
      compatible: true,
      online: true,
    });
    await coordinator.reconcile(1, true);
    expect(rows.get(1)).toMatchObject({
      phase: 'current',
      previousRuntimeVersion: '0.1.0',
      desiredRuntimeVersion: '0.2.0',
      previousImageId: release('a').imageId,
    });
    desired = release('c');
    desired = { ...desired, manifest: { ...desired.manifest, runtimeVersion: '0.3.0' } };
    await coordinator.reconcile(1);
    expect(rows.get(1)).toMatchObject({
      phase: 'current',
      previousRuntimeVersion: '0.2.0',
      desiredRuntimeVersion: '0.3.0',
      previousImageId: release('b').imageId,
    });
  });

  it.each([false, true])(
    'defers settled current SSH work durably (already-current=%s) but checks a new build immediately',
    async (alreadyCurrent) => {
      if (alreadyCurrent)
        host.inspect.mockResolvedValue({
          imageId: desired.imageId,
          managed: true,
          claimed: true,
          compatible: true,
          online: true,
        });
      host.prepare = jest.fn<
        ReturnType<NonNullable<ManagedRuntimeUpdateHost['prepare']>>,
        Parameters<NonNullable<ManagedRuntimeUpdateHost['prepare']>>
      >(async () => undefined);
      await coordinator.reconcile(1);
      expect(rows.get(1)).toMatchObject({ phase: 'current', retryAt: now + 5 * 60_000 });
      host.inspect.mockClear();
      host.prepare.mockClear();
      host.verify.mockClear();
      now += 30_000;
      coordinator.stop();
      coordinator = new WagoRuntimeUpdateCoordinator(
        store,
        async () => desired,
        host,
        audit,
        () => now,
      );
      expect(await coordinator.reconcile(1)).toBe('deferred');
      expect(host.inspect).not.toHaveBeenCalled();
      expect(host.prepare).not.toHaveBeenCalled();
      expect(host.verify).not.toHaveBeenCalled();
      desired = release('c');
      expect(await coordinator.reconcile(1)).toBe('settled');
      expect(host.inspect).toHaveBeenCalledTimes(1);
      expect(rows.get(1)).toMatchObject({ phase: 'current', desiredImageId: desired.imageId });
    },
  );

  it('rechecks current runtime health when its bounded steady-state deadline expires', async () => {
    await coordinator.reconcile(1);
    host.inspect.mockClear();
    now = rows.get(1)!.retryAt;
    host.inspect.mockResolvedValue({
      imageId: desired.imageId,
      managed: true,
      claimed: true,
      compatible: true,
      online: false,
    });
    expect(await coordinator.reconcile(1)).toBe('settled');
    expect(host.inspect).toHaveBeenCalledTimes(1);
    expect(rows.get(1)).toMatchObject({ phase: 'blocked', failure: 'offline', retryAt: now + 30_000 });
  });

  it('administrator retry advances backoff without discarding the rollback token', async () => {
    host.activate.mockRejectedValueOnce(new RuntimeUpdateError('load'));
    host.recover.mockRejectedValueOnce(new RuntimeUpdateError('recovery'));
    await coordinator.reconcile(1);
    const pending = { ...rows.get(1)! };
    expect(pending.phase).toBe('recovery_required');
    expect(await coordinator.reconcile(1)).toBe('deferred');
    host.recover.mockImplementationOnce(async (id, token, previous) => {
      expect(token).toBe(pending.token);
      expect(previous).toBe(pending.previousImageId);
      expect(rows.get(id)?.phase).toBe('recovering');
    });
    expect(await coordinator.reconcile(1, true)).toBe('settled');
    expect(rows.get(1)).toMatchObject({ phase: 'failed', failure: 'interrupted', token: null });
    await coordinator.reconcile(1);
    expect(rows.get(1)).toMatchObject({ phase: 'current', token: null });
    expect(host.recover).toHaveBeenCalledTimes(2);
  });

  it('administrator retry honors retained accepted cleanup before staging a new release', async () => {
    host.acknowledge.mockRejectedValueOnce(new Error('interrupted'));
    await coordinator.reconcile(1);
    const pending = { ...rows.get(1)! };
    desired = release('c');
    host.acknowledge.mockImplementationOnce(async (id, token) => {
      expect(token).toBe(pending.token);
      expect(rows.get(id)?.phase).toBe('current');
      expect(host.stage).toHaveBeenCalledTimes(1);
    });
    expect(await coordinator.reconcile(1, true)).toBe('settled');
    expect(rows.get(1)).toMatchObject({ phase: 'current', desiredImageId: desired.imageId, token: null });
  });

  it('persists and audits installer preparation before publication, and audit failure prevents it', async () => {
    host.prepare = jest.fn<
      ReturnType<NonNullable<ManagedRuntimeUpdateHost['prepare']>>,
      Parameters<NonNullable<ManagedRuntimeUpdateHost['prepare']>>
    >(async () => {
      expect(rows.get(1)?.phase).toBe('preparing');
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({ phase: 'preparing' }));
    });
    audit.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(coordinator.reconcile(1)).rejects.toThrow('audit unavailable');
    expect(host.prepare).not.toHaveBeenCalled();
    expect(host.stage).not.toHaveBeenCalled();
    expect(await coordinator.reconcile(1)).toBe('settled');
    expect(host.prepare).toHaveBeenCalledTimes(1);
    expect(rows.get(1)?.phase).toBe('current');
  });

  it('persists and audits intent before each remote effect and marks current only after fresh readiness', async () => {
    host.stage.mockImplementation(async () => {
      expect(rows.get(1)?.phase).toBe('staging');
      expect(audit).toHaveBeenCalled();
    });
    host.activate.mockImplementation(async () => {
      expect(rows.get(1)?.phase).toBe('activating');
    });
    host.accept.mockImplementation(async () => {
      expect(rows.get(1)?.phase).toBe('accepting');
    });
    host.acknowledge.mockImplementation(async () => {
      expect(rows.get(1)?.phase).toBe('current');
      expect(rows.get(1)?.token).toMatch(/^[a-f0-9]{32}$/);
    });
    expect(await coordinator.reconcile(1)).toBe('settled');
    expect(rows.get(1)).toMatchObject({
      phase: 'current',
      token: null,
      desiredImageId: release('b').imageId,
      failure: null,
    });
    expect(host.recover).not.toHaveBeenCalled();
  });

  it('never restarts for recompression, a new tag, or a new server build with the same image', async () => {
    desired = { ...release('a'), digest: 'f'.repeat(64), buildId: 'e'.repeat(40) };
    await coordinator.reconcile(1);
    expect(rows.get(1)?.phase).toBe('current');
    expect(host.stage).not.toHaveBeenCalled();
    expect(host.activate).not.toHaveBeenCalled();
    expect(host.verify).toHaveBeenCalledWith(1, null, desired.imageId, expect.any(Number), expect.any(AbortSignal));
  });

  it('keeps the installed image for a rebuilt release with the same runtime version, including after restart', async () => {
    const installedImage = release('a').imageId;
    host.inspect.mockResolvedValue({
      imageId: installedImage,
      runtimeVersion: desired.manifest.runtimeVersion,
      managed: true,
      claimed: true,
      compatible: true,
      online: true,
    });
    host.verify.mockImplementation(async (_id, _token, imageId) => ({
      imageId,
      permanent: true,
      ready: true,
      observedAt: ++now,
    }));
    await coordinator.reconcile(1);
    expect(rows.get(1)).toMatchObject({ phase: 'current', currentImageId: installedImage });
    expect(host.stage).not.toHaveBeenCalled();
    expect(host.activate).not.toHaveBeenCalled();
    expect(host.verify).toHaveBeenCalledWith(1, null, installedImage, expect.any(Number), expect.any(AbortSignal));
    host.inspect.mockClear();
    await coordinator.stop();
    coordinator = new WagoRuntimeUpdateCoordinator(
      store,
      async () => desired,
      host,
      audit,
      () => now,
    );
    await coordinator.reconcile(1, false, installedImage);
    expect(host.inspect).not.toHaveBeenCalled();
    now += 5 * 60_000;
    desired = release('c');
    await coordinator.reconcile(1, false, installedImage);
    expect(rows.get(1)).toMatchObject({ phase: 'current', currentImageId: installedImage });
    expect(host.stage).not.toHaveBeenCalled();
    desired = release('d');
    desired = { ...desired, manifest: { ...desired.manifest, runtimeVersion: '0.2.0' } };
    await coordinator.reconcile(1);
    expect(host.stage).toHaveBeenCalledTimes(1);
    expect(host.activate).toHaveBeenCalledTimes(1);
    expect(rows.get(1)).toMatchObject({ phase: 'current', currentImageId: desired.imageId });
  });

  it('still requires readiness for an installed image with the same runtime version', async () => {
    host.inspect.mockResolvedValue({
      imageId: release('a').imageId,
      runtimeVersion: desired.manifest.runtimeVersion,
      managed: true,
      claimed: true,
      compatible: true,
      online: true,
    });
    host.verify.mockResolvedValue({
      imageId: release('a').imageId,
      permanent: true,
      ready: false,
      observedAt: ++now,
    });
    await coordinator.reconcile(1);
    expect(rows.get(1)).toMatchObject({ phase: 'blocked', failure: 'readiness' });
    expect(host.stage).not.toHaveBeenCalled();
  });

  it.each([{ permanent: false }, { ready: false }, { observedAt: 0 }, { imageId: release('b').imageId }])(
    'requires fresh permanent readiness even for an identical image %j',
    async (overrides) => {
      desired = release('a');
      host.verify.mockResolvedValue({
        imageId: desired.imageId,
        permanent: true,
        ready: true,
        observedAt: now,
        ...overrides,
      });
      await coordinator.reconcile(1);
      expect(rows.get(1)).toMatchObject({ phase: 'blocked', failure: 'readiness' });
      expect(host.stage).not.toHaveBeenCalled();
      expect(host.activate).not.toHaveBeenCalled();
      expect(host.recover).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ managed: false }, 'management_required'],
    [{ claimed: false }, 'management_required'],
    [{ compatible: false }, 'incompatible'],
    [{ online: false }, 'offline'],
  ])('records a visible blocker and retries with durable backoff %j', async (overrides, failure) => {
    host.inspect.mockResolvedValue({
      imageId: release('a').imageId,
      managed: true,
      claimed: true,
      compatible: true,
      online: true,
      ...overrides,
    });
    await coordinator.reconcile(1);
    expect(rows.get(1)).toMatchObject({ phase: 'blocked', failure, retryAt: now + 30_000 });
    expect(await coordinator.reconcile(1)).toBe('deferred');
    expect(host.stage).not.toHaveBeenCalled();
    now += 30_000;
    await coordinator.reconcile(1);
    expect(rows.get(1)?.retryAt).toBe(now + 60_000);
  });

  it('re-resolves the desired image on retry, bypassing the old build backoff', async () => {
    host.stage.mockRejectedValueOnce(new RuntimeUpdateError('transfer'));
    await coordinator.reconcile(1);
    desired = release('c');
    await coordinator.reconcile(1);
    expect(host.stage.mock.calls[1][2].imageId).toBe(release('c').imageId);
    expect(rows.get(1)?.phase).toBe('current');
  });

  it.each(['stage', 'verify'] as const)('recovers if the desired image changes during %s', async (step) => {
    if (step === 'stage')
      host.stage.mockImplementation(async () => {
        desired = release('c');
      });
    else
      host.verify.mockImplementation(async () => {
        desired = release('c');
        return { imageId: release('b').imageId, permanent: true, ready: true, observedAt: ++now };
      });
    await coordinator.reconcile(1);
    expect(rows.get(1)).toMatchObject({ phase: 'failed', failure: 'release_changed' });
    expect(host.recover).toHaveBeenCalledTimes(1);
    expect(host.accept).not.toHaveBeenCalled();
    if (step === 'stage') expect(host.activate).not.toHaveBeenCalled();
  });

  it.each(['transfer', 'load', 'storage', 'host_gate'] as const)(
    'preserves the prior image on %s failure',
    async (failure) => {
      host.activate.mockRejectedValueOnce(new RuntimeUpdateError(failure));
      await coordinator.reconcile(1);
      expect(rows.get(1)).toMatchObject({ phase: 'failed', failure });
      expect(host.recover).toHaveBeenCalledWith(1, expect.any(String), release('a').imageId, expect.any(AbortSignal));
    },
  );

  it('retains actionable storage figures after recovery and clears them on a successful retry', async () => {
    const storageDiagnostics = [{ path: '/var/lib', requiredKiB: 180397, availableKiB: 176652 }];
    host.stage.mockRejectedValueOnce(new RuntimeUpdateError('storage', storageDiagnostics));
    await coordinator.reconcile(1);
    expect(rows.get(1)).toMatchObject({ phase: 'failed', failure: 'storage', storageDiagnostics, token: null });
    await coordinator.reconcile(1, true);
    expect(rows.get(1)).toMatchObject({ phase: 'current', failure: null });
    expect(rows.get(1)?.storageDiagnostics).toBeUndefined();
  });

  it.each([{ permanent: false }, { ready: false }, { imageId: release('a').imageId }, { observedAt: 1_000_000 }])(
    'rejects incomplete, retained, or wrong-image readiness %j',
    async (overrides) => {
      host.verify.mockImplementation(async () => ({
        imageId: desired.imageId,
        permanent: true,
        ready: true,
        observedAt: ++now,
        ...overrides,
      }));
      await coordinator.reconcile(1);
      expect(rows.get(1)).toMatchObject({ phase: 'failed', failure: 'readiness' });
      expect(host.accept).not.toHaveBeenCalled();
    },
  );

  it('retains the token across failed recovery and recovers before staging on restart', async () => {
    host.activate.mockRejectedValueOnce(new RuntimeUpdateError('load'));
    host.recover.mockRejectedValueOnce(new Error('raw secret transport output'));
    await coordinator.reconcile(1);
    const token = rows.get(1)?.token;
    expect(rows.get(1)).toMatchObject({ phase: 'recovery_required', failure: 'recovery' });
    expect(JSON.stringify(rows.get(1))).not.toContain('raw secret');
    coordinator.stop();
    coordinator = new WagoRuntimeUpdateCoordinator(
      store,
      async () => desired,
      host,
      audit,
      () => now,
    );
    expect(await coordinator.reconcile(1)).toBe('deferred');
    expect(host.recover).toHaveBeenCalledTimes(1);
    now = rows.get(1)?.retryAt ?? now + 60_000;
    await coordinator.reconcile(1);
    expect(host.recover.mock.calls[1][1]).toBe(token);
    expect(rows.get(1)).toMatchObject({ phase: 'failed', failure: 'interrupted', token: null });
    await coordinator.reconcile(1);
    expect(rows.get(1)?.phase).toBe('current');
  });

  it('gives a new rollout its own deadline after slow crash recovery and acknowledgement', async () => {
    host.stage.mockRejectedValueOnce(new RuntimeUpdateError('transfer'));
    host.recover.mockRejectedValueOnce(new RuntimeUpdateError('recovery'));
    await coordinator.reconcile(1);
    host.stage.mockClear();
    host.recover.mockImplementation(async () => {
      now += 20 * 60_000;
    });
    host.acknowledge.mockImplementation(async () => {
      now += 4 * 60_000;
    });
    host.stage.mockImplementation(async () => {
      now += 2 * 60_000;
    });
    expect(await coordinator.reconcile(1, true)).toBe('settled');
    expect(rows.get(1)).toMatchObject({ phase: 'failed', failure: 'interrupted', token: null });
    expect(host.stage).not.toHaveBeenCalled();
    expect(owners.size).toBe(0);
    await coordinator.reconcile(1);
    expect(rows.get(1)).toMatchObject({ phase: 'current', token: null });
  });

  it('resumes acknowledgement after interruption without rolling back an accepted rollout', async () => {
    host.acknowledge.mockRejectedValueOnce(new Error('disconnected'));
    expect(await coordinator.reconcile(1)).toBe('deferred');
    expect(rows.get(1)?.phase).toBe('current');
    expect(rows.get(1)).toMatchObject({ cleanupAttempt: 1, cleanupRetryAt: now + 30_000 });
    coordinator.stop();
    coordinator = new WagoRuntimeUpdateCoordinator(
      store,
      async () => desired,
      host,
      audit,
      () => now,
    );
    expect(await coordinator.reconcile(1)).toBe('deferred');
    expect(host.acknowledge).toHaveBeenCalledTimes(1);
    now += 30_000;
    host.inspect.mockResolvedValue({
      imageId: desired.imageId,
      managed: true,
      claimed: true,
      compatible: true,
      online: true,
    });
    await coordinator.reconcile(1);
    expect(host.recover).not.toHaveBeenCalled();
    expect(host.activate).toHaveBeenCalledTimes(1);
    expect(rows.get(1)?.token).toBeNull();
    expect(rows.get(1)).toMatchObject({ cleanupAttempt: 0, cleanupRetryAt: 0 });
  });

  it('bounds fleet concurrency, isolates failures, and coalesces duplicate controller work', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    host.stage.mockImplementation(async (id) => {
      if (id === 1) await gate;
      else throw new RuntimeUpdateError('transfer');
    });
    const first = coordinator.reconcile(1);
    const second = coordinator.reconcile(2);
    expect(await coordinator.reconcile(1)).toBe('busy');
    expect(await coordinator.reconcile(3)).toBe('busy');
    await second;
    expect(rows.get(2)?.phase).toBe('failed');
    finish();
    await first;
    expect(rows.get(1)?.phase).toBe('current');
    expect(host.recover.mock.calls.every(([id]) => id === 2)).toBe(true);
  });

  it('stops mutation after cancellation and leaves durable recovery intent', async () => {
    host.stage.mockImplementation(async () => {
      void coordinator.stop();
    });
    await expect(coordinator.reconcile(1)).rejects.toThrow('interrupted');
    expect(rows.get(1)?.phase).toBe('staging');
    expect(host.activate).not.toHaveBeenCalled();
    expect(host.recover).not.toHaveBeenCalled();
    expect(owners.size).toBe(0);
  });

  it('waits for cancelled transport and conditional lease release before shutdown resolves', async () => {
    let entered!: () => void;
    const staging = new Promise<void>((resolve) => {
      entered = resolve;
    });
    host.stage.mockImplementation(async (_id, _token, _desired, signal) => {
      entered();
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new RuntimeUpdateError('interrupted')), { once: true });
      });
    });
    let release!: () => void, releasing!: () => void;
    const leaseRelease = new Promise<void>((resolve) => {
      release = resolve;
    });
    const releaseStarted = new Promise<void>((resolve) => {
      releasing = resolve;
    });
    const originalRelease = store.release;
    store.release = async (id, owner) => {
      releasing();
      await leaseRelease;
      await originalRelease(id, owner);
    };
    const update = expect(coordinator.reconcile(1)).rejects.toThrow('interrupted');
    await staging;
    let stopped = false;
    const shutdown = Promise.resolve(coordinator.stop()).then(() => {
      stopped = true;
    });
    await releaseStarted;
    await Promise.resolve();
    expect(stopped).toBe(false);
    expect(owners.size).toBe(1);
    release();
    await Promise.all([shutdown, update]);
    expect(owners.size).toBe(0);
    expect(rows.get(1)?.phase).toBe('staging');
    expect(host.recover).not.toHaveBeenCalled();
  });
});
