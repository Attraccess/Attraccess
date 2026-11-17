import { createWagoTestStorage } from '../storage/testing';
import { RepositoryManagementStore } from './store';
import type { ManagementRecord } from './model';

describe('persistent management store', () => {
  it('stores ciphertext in its own column, keeps it out of the metadata, and fences stale writers', async () => {
    const test = createWagoTestStorage();
    const store = new RepositoryManagementStore(test.tables.management);
    const record: ManagementRecord = {
      target: { controllerId: 1, host: '10.88.0.1', hostKeyFingerprint: `SHA256:${'a'.repeat(43)}` },
      state: 'preparing',
      inspection: null,
      mode: 'baseline',
      exceptions: [],
      support: 'qualification_required',
      reviewToken: null,
      reviewedAt: null,
      transaction: null,
      keyFingerprint: null,
      encryptedPrivateKey: 'host-encrypted-envelope',
      failure: null,
    };
    expect(await store.acquire(1, 'first', 1000, 2000)).toBe(true);
    expect(await store.acquire(1, 'other-process', 1001, 2001)).toBe(false);
    await store.save(1, 'first', record, 1002);
    const freshStore = new RepositoryManagementStore(test.tables.management);
    expect(await freshStore.load(1)).toEqual(record);
    const row = await test.tables.management.get(1);
    expect(row?.encryptedPrivateKey).toBe('host-encrypted-envelope');
    expect(row?.metadataJson).not.toContain('host-encrypted-envelope');
    expect(await freshStore.acquire(1, 'restarted', 2001, 3001)).toBe(true);
    await store.release(1, 'first'); // cannot release a successor's lock
    await expect(store.save(1, 'first', record, 2002)).rejects.toThrow('lease_lost');
    expect(await store.acquire(1, 'third', 2003, 3003)).toBe(false);
    await freshStore.release(1, 'restarted');
    expect(await store.acquire(1, 'third', 2004, 3004)).toBe(true);
  });

  it('lets exactly one of two concurrent acquirers take an expired lease', async () => {
    const test = createWagoTestStorage();
    const store = new RepositoryManagementStore(test.tables.management);
    expect(await store.acquire(1, 'old', 1000, 2000)).toBe(true);
    const results = await Promise.all([store.acquire(1, 'a', 2500, 3500), store.acquire(1, 'b', 2500, 3500)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
