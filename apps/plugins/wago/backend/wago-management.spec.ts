import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ManagementError, WagoManagementService } from './wago-management';
import { generateManagementKey } from './wago-management-key';
import { WagoManagementProvider } from './wago-management-provider';
import type {
  ManagementAdapter,
  ManagementInspection,
  ManagementMode,
  ManagementQualification,
  ManagementRecord,
  ManagementStore,
  ManagementTarget,
  ManagementTransaction,
} from './wago-management.types';

const target: ManagementTarget = { controllerId: 7, host: '10.77.0.7', hostKeyFingerprint: `SHA256:${'a'.repeat(43)}` };
const credential = { username: 'operator', password: 'test-session-only-password' };
const observation: ManagementInspection = {
  model: 'cc100',
  firmware: '31',
  ssh: 'openssh',
  serviceControl: 'sysv',
  uid: 1004,
  wbm: 'not_observed',
  otherManagement: 'not_observed',
  networkScope: 'local_socket_observation',
  passwordAccess: 'unknown',
  defaultAccess: 'unknown',
};

class MemoryStore implements ManagementStore {
  records = new Map<number, ManagementRecord>();
  leases = new Map<number, { owner: string; until: number }>();
  history: ManagementRecord[] = [];
  async load(id: number) {
    return structuredClone(this.records.get(id) ?? null);
  }
  async acquire(id: number, owner: string, now: number, until: number) {
    if ((this.leases.get(id)?.until ?? 0) >= now) return false;
    this.leases.set(id, { owner, until });
    return true;
  }
  async save(id: number, owner: string, record: ManagementRecord, now: number) {
    if (this.leases.get(id)?.owner !== owner || this.leases.get(id)!.until < now) throw new Error('lease_lost');
    this.records.set(id, structuredClone(record));
    this.history.push(structuredClone(record));
  }
  async release(id: number, owner: string) {
    if (this.leases.get(id)?.owner === owner) this.leases.delete(id);
  }
}

function harness() {
  const store = new MemoryStore();
  const encryptionKey = randomBytes(32);
  const secrets = {
    encrypt: jest.fn((plaintext: string) => {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
      return Buffer.concat([iv, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]).toString('base64');
    }),
    decrypt: jest.fn((ciphertext: string) => {
      const bytes = Buffer.from(ciphertext, 'base64'),
        cipher = createDecipheriv('aes-256-gcm', encryptionKey, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(-16));
      return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString();
    }),
  };
  const calls: string[] = [];
  let keyFingerprint = '';
  const operation = (name: string) =>
    jest.fn(async () => {
      calls.push(name);
    });
  const adapter = {
    inspect: jest.fn(async () => ({ ...observation })),
    // Qualified only inside this mock; never shipped as a real platform provider.
    qualify: jest.fn<ManagementQualification, [ManagementInspection, ManagementMode]>(() => ({
      support: 'supported',
      evidence: 'fw31-qualified-baseline',
      minimumPrivileges: true,
      rebootSafeWatchdog: true,
    })),
    prepare: operation('prepare'),
    armWatchdog: jest.fn(async () => {
      calls.push('arm');
      return { armed: true, rebootSafe: true };
    }),
    installKey: jest.fn(async (_tx: ManagementTransaction, _credential: unknown, publicKey: string) => {
      calls.push('install');
      keyFingerprint = `SHA256:${createHash('sha256')
        .update(Buffer.from(publicKey.split(' ')[1], 'base64'))
        .digest('base64')
        .replace(/=+$/, '')}`;
    }),
    verifyKey: jest.fn(async (_tx: ManagementTransaction, _privateKey: string, nonce: string) => {
      calls.push('verify');
      return {
        nonce,
        hostKeyFingerprint: target.hostKeyFingerprint,
        keyFingerprint,
        keyOnly: true,
        uid: observation.uid!,
        managementOperationSucceeded: true,
      };
    }),
    restrictAccess: operation('restrict'),
    verifyBaseline: jest.fn(async () => {
      calls.push('baseline');
      return {
        passwordDisabled: true,
        defaultAccessDisabled: true,
        minimumPrivileges: true,
        wbmSecure: true,
        otherManagementSecure: true,
      };
    }),
    commit: operation('commit'),
    rollback: operation('rollback'),
  } satisfies ManagementAdapter;
  let clock = 1000000;
  const service = new WagoManagementService(store, secrets, adapter, () => clock);
  const review = async () => {
    await service.inspect(target, credential);
    return service.review(target.controllerId, { mode: 'baseline', exceptions: [] });
  };
  const apply = (reviewToken: string) =>
    service.apply(target.controllerId, { reviewToken, confirm: true, temporarySsh: credential });
  return {
    store,
    secrets,
    adapter,
    service,
    calls,
    review,
    apply,
    advance: (ms: number) => {
      clock += ms;
    },
    now: () => clock,
  };
}

describe('management transition orchestration (no device or broker connections)', () => {
  it('does not persist a review after outer ownership is lost during the read', async () => {
    const h = harness();
    await h.service.inspect(target, credential);
    const original = await h.store.load(7);
    let finish!: (record: ManagementRecord | null) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    jest.spyOn(h.store, 'load').mockImplementationOnce(() => {
      entered();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    let owned = true;
    const review = h.service.review(7, { mode: 'baseline', exceptions: [] }, async () => {
      if (!owned) throw new Error('outer_lease_lost');
    });
    await started;
    owned = false;
    finish(original);
    await expect(review).rejects.toMatchObject({ code: 'operation_failed' });
    expect(h.store.history).toHaveLength(1);
    expect(h.store.records.get(7)?.state).toBe('inspected');
    expect(h.store.records.get(7)?.reviewToken).toBeNull();
  });

  it('does not start rollback after outer ownership is lost during persistence', async () => {
    const h = harness();
    const reviewed = await h.review();
    const save = h.store.save.bind(h.store);
    let owned = true;
    jest.spyOn(h.store, 'save').mockImplementation(async (...args) => {
      await save(...args);
      owned = false;
    });
    await expect(
      h.service.apply(7, { reviewToken: reviewed.reviewToken!, confirm: true, temporarySsh: credential }, async () => {
        if (!owned) throw new Error('outer_lease_lost');
      }),
    ).rejects.toMatchObject({ code: 'operation_failed' });
    expect(h.adapter.prepare).not.toHaveBeenCalled();
    expect(h.adapter.rollback).not.toHaveBeenCalled();
    expect(h.store.records.get(7)?.state).toBe('preparing');
  });

  it('requires explicit inspect and review, and serializes the complete verify-before-disable transition', async () => {
    const h = harness();
    await expect(h.service.review(7, { mode: 'baseline', exceptions: [] })).rejects.toMatchObject({
      code: 'inspect_required',
    });
    const review = await h.review();
    expect(h.calls).toEqual([]);
    const result = await h.apply(review.reviewToken!);
    expect(h.calls).toEqual(['prepare', 'arm', 'install', 'verify', 'restrict', 'verify', 'baseline', 'commit']);
    expect(result).toMatchObject({ state: 'hardened', hardened: true, reviewToken: null });
    const encrypted = h.store.records.get(7)!.encryptedPrivateKey!;
    expect(h.secrets.decrypt(encrypted)).toContain('OPENSSH PRIVATE KEY');
    const publicJson = JSON.stringify(result),
      persistedJson = JSON.stringify(h.store.history);
    for (const text of [publicJson, persistedJson]) {
      expect(text).not.toContain(credential.password);
      expect(text).not.toContain('OPENSSH PRIVATE KEY');
    }
    expect(publicJson).not.toContain(encrypted);
    expect(publicJson.length).toBeLessThan(2048);
    expect(h.store.history.find((entry) => entry.state === 'preparing')?.encryptedPrivateKey).toBeTruthy();
  });

  it.each(['unsupported', 'unknown'] as const)('blocks missing firmware evidence: %s', async (firmware) => {
    const h = harness();
    const provider = new WagoManagementProvider({ execute: jest.fn(), verifyNewKeyConnection: jest.fn() });
    h.adapter.inspect.mockResolvedValue({ ...observation, firmware });
    h.adapter.qualify.mockImplementation((...args) => provider.qualify(...args));
    const review = await h.review();
    await expect(h.apply(review.reviewToken!)).rejects.toMatchObject({
      code: firmware === 'unsupported' ? 'UNSUPPORTED' : 'qualification_required',
    });
    expect(h.calls).toEqual([]);
  });

  it('does not turn an installed root key or unqualified privileges into hardened', async () => {
    const h = harness();
    const review = await h.review();
    h.adapter.verifyKey.mockImplementation(async (_tx, _key, nonce) => ({
      nonce,
      keyOnly: true,
      hostKeyFingerprint: target.hostKeyFingerprint,
      keyFingerprint: h.store.records.get(7)!.keyFingerprint!,
      uid: 0,
      managementOperationSucceeded: true,
    }));
    expect(await h.apply(review.reviewToken!)).toMatchObject({ state: 'recovered', hardened: false });
    expect(h.calls).not.toContain('restrict');
  });

  it.each(['nonce', 'pin', 'key', 'password', 'operation'] as const)(
    'rejects invalid second connection proof: %s',
    async (fault) => {
      const h = harness(),
        review = await h.review();
      h.adapter.verifyKey.mockImplementation(async (_tx, _key, nonce) => ({
        nonce: fault === 'nonce' ? 'reused' : nonce,
        hostKeyFingerprint: fault === 'pin' ? 'changed' : target.hostKeyFingerprint,
        keyFingerprint: fault === 'key' ? 'wrong-key' : h.store.records.get(7)!.keyFingerprint!,
        keyOnly: fault !== 'password',
        uid: observation.uid!,
        managementOperationSucceeded: fault !== 'operation',
      }));
      const result = await h.apply(review.reviewToken!);
      expect(result.state).toBe('recovered');
      expect(h.calls).not.toContain('restrict');
      expect(h.calls).not.toContain('commit');
      expect(h.adapter.rollback).toHaveBeenCalledTimes(1);
    },
  );

  it('failed second connection rolls back without leaking transport secrets', async () => {
    const h = harness(),
      review = await h.review();
    h.adapter.verifyKey.mockRejectedValue(new Error(`stderr ${credential.password} PRIVATE KEY ${'x'.repeat(100000)}`));
    expect(await h.apply(review.reviewToken!)).toMatchObject({ state: 'recovered', failure: 'transition_failed' });
    expect(h.calls).not.toContain('restrict');
    expect(JSON.stringify(h.store.history)).not.toContain(credential.password);
  });

  it('post-restriction verification failure rolls back before disarming the watchdog', async () => {
    const h = harness(),
      review = await h.review();
    h.adapter.verifyBaseline.mockResolvedValue({
      passwordDisabled: false,
      defaultAccessDisabled: true,
      minimumPrivileges: true,
      wbmSecure: true,
      otherManagementSecure: true,
    });
    expect(await h.apply(review.reviewToken!)).toMatchObject({ state: 'recovered' });
    expect(h.adapter.verifyBaseline).toHaveBeenCalledTimes(1);
    expect(h.calls.at(-1)).toBe('rollback');
    expect(h.calls).not.toContain('commit');
  });

  it('retains encrypted key and journal on rollback failure, then explicitly recovers with fresh credentials', async () => {
    const h = harness(),
      review = await h.review();
    h.adapter.restrictAccess.mockRejectedValue(new Error('failed'));
    h.adapter.rollback.mockRejectedValueOnce(new Error(credential.password));
    const result = await h.apply(review.reviewToken!);
    expect(result).toMatchObject({ state: 'recovery_required', failure: 'rollback_failed', recoveryRequired: true });
    expect(h.store.records.get(7)?.transaction).toBeTruthy();
    expect(h.store.records.get(7)?.encryptedPrivateKey).toBeTruthy();
    await expect(
      h.service.recover(7, { confirm: true, temporarySsh: { username: 'operator', password: '' } }),
    ).rejects.toBeInstanceOf(ManagementError);
    const recovered = await h.service.recover(7, {
      confirm: true,
      temporarySsh: { ...credential, password: 'fresh-request' },
    });
    expect(recovered).toMatchObject({ state: 'recovered', recoveryRequired: false, keyFingerprint: null });
    expect(h.store.records.get(7)?.encryptedPrivateKey).toBeNull();
  });

  it('restart during hardening never retries restrictions and waits for the crashed writer lease', async () => {
    const h = harness(),
      review = await h.review();
    await h.apply(review.reviewToken!);
    h.store.records.set(7, structuredClone(h.store.history.find((entry) => entry.state === 'restricting_access')!));
    h.store.leases.set(7, { owner: 'crashed-process', until: h.now() + 300000 });
    h.calls.length = 0;
    const restarted = new WagoManagementService(h.store, h.secrets, h.adapter, h.now);
    expect(await restarted.status(7)).toMatchObject({ recoveryRequired: true, hardened: false });
    expect(h.calls).toEqual([]);
    await expect(restarted.recover(7, { confirm: true, temporarySsh: credential })).rejects.toMatchObject({
      code: 'busy',
    });
    h.advance(300001);
    expect(await restarted.recover(7, { confirm: true, temporarySsh: credential })).toMatchObject({
      state: 'recovered',
    });
    expect(h.calls).toEqual(['rollback']);
  });

  it('exceptions never become hardened, and additive mode never disables access', async () => {
    const h = harness();
    await h.review();
    const review = await h.service.review(7, { mode: 'key_only', exceptions: ['unqualified_privileges'] });
    const result = await h.apply(review.reviewToken!);
    expect(result).toMatchObject({ state: 'key_enrolled', hardened: false, support: 'qualification_required' });
    expect(h.calls).toEqual(['prepare', 'arm', 'install', 'verify', 'commit']);
  });

  it('invalid generated key or encryption failure never reaches the controller', async () => {
    const h = harness();
    const review = await h.review();
    const service = new WagoManagementService(h.store, h.secrets, h.adapter, h.now, () => ({
      ...generateManagementKey(),
      publicKey: 'ssh-ed25519 invalid',
    }));
    await expect(
      service.apply(7, { reviewToken: review.reviewToken!, confirm: true, temporarySsh: credential }),
    ).rejects.toMatchObject({ code: 'operation_failed' });
    expect(h.calls).toEqual([]);
    h.secrets.encrypt.mockImplementation(() => {
      throw new Error(credential.password);
    });
    await expect(h.apply(review.reviewToken!)).rejects.toMatchObject({ code: 'operation_failed' });
    expect(h.calls).toEqual([]);
  });

  it('bounds reviews, rejects arbitrary scripts, and requires reinspection after drift', async () => {
    const h = harness();
    const review = await h.review();
    await expect(
      h.service.review(7, { mode: 'baseline', exceptions: [], script: 'rm -rf /' } as never),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    h.adapter.inspect.mockResolvedValue({ ...observation, ssh: 'dropbear' });
    await expect(h.apply(review.reviewToken!)).rejects.toMatchObject({ code: 'inspect_required' });
    h.advance(300001);
    await expect(h.apply(review.reviewToken!)).rejects.toMatchObject({ code: 'review_required' });
    expect(h.calls).toEqual([]);
  });

  it('serializes per controller across service instances without blocking other controllers', async () => {
    const h = harness(),
      review = await h.review();
    let resume!: () => void;
    h.adapter.prepare.mockImplementationOnce(
      async () =>
        new Promise<void>((resolve) => {
          resume = resolve;
        }),
    );
    const first = h.apply(review.reviewToken!);
    while (!resume) await new Promise((resolve) => setImmediate(resolve));
    const second = new WagoManagementService(h.store, h.secrets, h.adapter, h.now);
    await expect(
      second.apply(7, { reviewToken: review.reviewToken!, confirm: true, temporarySsh: credential }),
    ).rejects.toMatchObject({ code: 'busy' });
    expect(await second.inspect({ ...target, controllerId: 8 }, credential)).toMatchObject({ controllerId: 8 });
    resume();
    await first;
  });

  it('refuses restrictions without a confirmed reboot-safe watchdog', async () => {
    const h = harness(),
      review = await h.review();
    h.adapter.armWatchdog.mockResolvedValue({ armed: true, rebootSafe: false });
    expect(await h.apply(review.reviewToken!)).toMatchObject({ state: 'recovered' });
    expect(h.calls).not.toContain('install');
    expect(h.calls).not.toContain('restrict');
  });

  it('retains recovery identity when the final recovery database write fails', async () => {
    const h = harness(),
      review = await h.review();
    h.adapter.verifyKey.mockRejectedValue(new Error('no connection'));
    const save = h.store.save.bind(h.store);
    jest.spyOn(h.store, 'save').mockImplementation(async (id, owner, record, now) => {
      if (record.state === 'recovered') throw new Error('database unavailable');
      await save(id, owner, record, now);
    });
    expect(await h.apply(review.reviewToken!)).toMatchObject({ state: 'recovery_required' });
    expect(h.store.records.get(7)?.transaction).toBeTruthy();
    expect(h.store.records.get(7)?.encryptedPrivateKey).toBeTruthy();
  });

  it('an expired transition cannot disable access and a third connection failure cannot commit', async () => {
    const h = harness(),
      review = await h.review();
    const verify = h.adapter.verifyKey.getMockImplementation()!;
    h.adapter.verifyKey.mockImplementation(async (...args) => {
      const proof = await verify(...args);
      h.advance(150000);
      return proof;
    });
    expect(await h.apply(review.reviewToken!)).toMatchObject({ state: 'recovered' });
    expect(h.calls).not.toContain('restrict');

    const other = harness(),
      otherReview = await other.review();
    const otherVerify = other.adapter.verifyKey.getMockImplementation()!;
    other.adapter.verifyKey
      .mockImplementationOnce(otherVerify)
      .mockRejectedValueOnce(new Error('policy locked out key'));
    expect(await other.apply(otherReview.reviewToken!)).toMatchObject({ state: 'recovered' });
    expect(other.calls).toContain('restrict');
    expect(other.calls).not.toContain('commit');
  });

  it('does not let a reviewed baseline exposure exception imply hardened', async () => {
    const h = harness();
    await h.review();
    const review = await h.service.review(7, { mode: 'baseline', exceptions: ['wbm_exposed'] });
    h.adapter.verifyBaseline.mockResolvedValue({
      passwordDisabled: true,
      defaultAccessDisabled: true,
      minimumPrivileges: true,
      wbmSecure: false,
      otherManagementSecure: true,
    });
    expect(await h.apply(review.reviewToken!)).toMatchObject({ state: 'key_enrolled', hardened: false });
  });

  it('drops unexpected inspection properties and never forwards a full baseline command through the built-in provider', async () => {
    const h = harness();
    h.adapter.inspect.mockResolvedValue(
      Object.assign({}, observation, { password: credential.password, stdout: 'private output' }),
    );
    const result = await h.service.inspect(target, credential);
    expect(JSON.stringify(result)).not.toContain(credential.password);
    expect(JSON.stringify(h.store.history)).not.toContain('private output');
    const ssh = { execute: jest.fn(), verifyNewKeyConnection: jest.fn() };
    const provider = new WagoManagementProvider(ssh);
    expect(provider.qualify(observation, 'baseline').support).toBe('qualification_required');
    expect(provider.qualify({ ...observation, uid: 0 }, 'key_only').support).toBe('qualification_required');
    await expect(provider.restrictAccess()).rejects.toThrow('qualification_required');
    expect(ssh.execute).not.toHaveBeenCalled();
  });

  it('makes the retained generated key available only to the trusted recovery adapter after restart', async () => {
    const h = harness(),
      review = await h.review();
    await h.apply(review.reviewToken!);
    const restarted = new WagoManagementService(h.store, h.secrets, h.adapter, h.now);
    const result = await restarted.recover(7, { confirm: true, temporarySsh: credential });
    expect(result.state).toBe('recovered');
    expect(h.adapter.rollback).toHaveBeenCalledWith(
      expect.objectContaining({ target }),
      credential,
      expect.stringContaining('-----BEGIN OPENSSH PRIVATE KEY-----'),
    );
    expect(JSON.stringify(result)).not.toContain('PRIVATE KEY');
    expect(h.store.records.get(7)?.encryptedPrivateKey).toBeNull();
  });
});
