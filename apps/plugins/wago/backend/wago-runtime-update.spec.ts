import { WagoRuntimeUpdateCoordinator, RuntimeUpdateError } from './wago-runtime-update';
import type { ManagedRuntimeUpdateHost, RuntimeUpdateRecord, RuntimeUpdateStore } from './wago-runtime-update';
import type { BuildRuntimeArtifact } from './wago-build-runtime';

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
    now = 1_000_000;
    desired = release('b');
    rows = new Map();
    owners = new Map();
    store = {
      acquire: async (id, owner) => {
        if (owners.has(id)) return false;
        owners.set(id, owner);
        return true;
      },
      load: async (id) => {
        const row = rows.get(id);
        return row ? { ...row } : null;
      },
      save: async (row, owner) => {
        if (owners.get(row.controllerId) !== owner) throw new Error('lease_lost');
        rows.set(row.controllerId, { ...row });
      },
      release: async (id, owner) => {
        if (owners.get(id) === owner) owners.delete(id);
      },
    };
    host = {
      inspect: jest.fn<
        ReturnType<ManagedRuntimeUpdateHost['inspect']>,
        Parameters<ManagedRuntimeUpdateHost['inspect']>
      >(async () => ({ imageId: release('a').imageId, managed: true, claimed: true, compatible: true, online: true })),
      stage: jest.fn<ReturnType<ManagedRuntimeUpdateHost['stage']>, Parameters<ManagedRuntimeUpdateHost['stage']>>(
        async () => undefined,
      ),
      activate: jest.fn<
        ReturnType<ManagedRuntimeUpdateHost['activate']>,
        Parameters<ManagedRuntimeUpdateHost['activate']>
      >(async () => undefined),
      verify: jest.fn<ReturnType<ManagedRuntimeUpdateHost['verify']>, Parameters<ManagedRuntimeUpdateHost['verify']>>(
        async () => ({ imageId: desired.imageId, permanent: true, ready: true, observedAt: ++now }),
      ),
      accept: jest.fn<ReturnType<ManagedRuntimeUpdateHost['accept']>, Parameters<ManagedRuntimeUpdateHost['accept']>>(
        async () => undefined,
      ),
      acknowledge: jest.fn<
        ReturnType<ManagedRuntimeUpdateHost['acknowledge']>,
        Parameters<ManagedRuntimeUpdateHost['acknowledge']>
      >(async () => undefined),
      recover: jest.fn<
        ReturnType<ManagedRuntimeUpdateHost['recover']>,
        Parameters<ManagedRuntimeUpdateHost['recover']>
      >(async () => undefined),
    };
    audit = jest.fn(async () => undefined);
    coordinator = new WagoRuntimeUpdateCoordinator(
      store,
      async () => desired,
      host,
      audit,
      () => now,
    );
  });
  afterEach(() => coordinator.stop());

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
    expect(rows.get(1)?.phase).toBe('current');
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
    host.stage.mockImplementation(async () => coordinator.stop());
    await expect(coordinator.reconcile(1)).rejects.toThrow('interrupted');
    expect(rows.get(1)?.phase).toBe('staging');
    expect(host.activate).not.toHaveBeenCalled();
    expect(host.recover).not.toHaveBeenCalled();
    expect(owners.size).toBe(0);
  });
});
