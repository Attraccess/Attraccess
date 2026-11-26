import { ReaderDeletedEvent } from '../events';
import { FakeCredentialStore, FakeUnitOfWork } from '../attractap-fake-stores.test-fixture';
import type { ReaderCredentialRow } from './credential-store.port';
import type { ClusterService } from '../../cluster/cluster.service';
import { CLUSTER_CREDENTIAL_CACHE_MS, CredentialRegistryService } from './credential-registry.service';

describe('CredentialRegistryService', () => {
  let store: FakeCredentialStore;
  let pendingRead: (() => void) | null = null;
  let service: CredentialRegistryService;
  const seed = (id: number, row: Partial<ReaderCredentialRow>) => store.addReader({ ...row, id });
  const rows = { get: (id: number) => store.rows.get(id), delete: (id: number) => store.rows.delete(id) };
  // The events of the history, as the registry appended them.
  const events = (): Array<Record<string, unknown>> => store.events as unknown as Array<Record<string, unknown>>;

  beforeEach(() => {
    store = new FakeCredentialStore();
    pendingRead = null;
    const findState = store.findState.bind(store);
    store.findState = async (readerId: number) => {
      const snapshot = await findState(readerId);
      if (pendingRead === null) return snapshot;
      await new Promise<void>((resolve) => (pendingRead = resolve));
      return snapshot;
    };
    service = new CredentialRegistryService(store, new FakeUnitOfWork());
  });

  const paired = (id: number, fingerprint: string): Partial<ReaderCredentialRow> => ({
    id,
    name: `reader-${id}`,
    pairingState: 'paired',
    credentialFingerprint: fingerprint,
    certificateSerial: '0a',
  });

  it('caches lookups and drops the cache entry on revoke', async () => {
    seed(1, paired(1, 'fp'));
    expect(await service.isActive(1, 'fp')).toBe(true);
    expect(await service.isActive(1, 'fp')).toBe(true);
    expect(store.reads).toBe(1);

    await service.revoke(1, 9);
    expect(await service.isActive(1, 'fp')).toBe(false);
    expect(events()).toEqual([
      expect.objectContaining({ state: 'revoked', keyFingerprint: 'fp', certificateSerial: '0a' }),
    ]);
    // Decided on the row inside the transaction: a second revoke finds nothing to revoke.
    await expect(service.revoke(1, 9)).rejects.toThrow('not paired');
    expect(events()).toHaveLength(1);
  });

  it('never caches a read that started before an invalidation', async () => {
    seed(2, paired(2, 'fp'));
    pendingRead = () => undefined; // the next read waits until released
    const slow = service.isActive(2, 'fp');
    await new Promise((r) => setImmediate(r));
    seed(2, { ...paired(2, 'fp'), pairingState: 'revoked' });
    service.invalidate(2);
    (pendingRead as unknown as () => void)();
    pendingRead = null;
    await slow; // saw the old state, but must not have cached it
    expect(await service.isActive(2, 'fp')).toBe(false);
  });

  it('closes the previous credential in the history when a reader is re-paired or replaced', async () => {
    seed(3, paired(3, 'old'));
    const result = await service.markPaired({
      readerId: 3,
      fingerprint: 'new',
      certificate: { serial: '0b', notAfter: new Date() },
      actorId: 1,
      previousCredentialBecomes: 'replaced',
    });
    expect(result.previousFingerprint).toBe('old');
    expect(events().map((e) => [e['state'], e['keyFingerprint'], e['certificateSerial']])).toEqual([
      ['replaced', 'old', '0a'],
      ['paired', 'new', '0b'],
    ]);
    expect(rows.get(3)).toMatchObject({ credentialFingerprint: 'new', certificateSerial: '0b' });
    expect(await service.isActive(3, 'new')).toBe(true);
    expect(await service.isActive(3, 'old')).toBe(false);
  });

  it('refuses to make a key the credential of a second reader', async () => {
    seed(6, paired(6, 'shared'));
    seed(7, { id: 7, name: 'reader-7', pairingState: 'revoked', credentialFingerprint: null });
    const pair = (readerId: number) =>
      service.markPaired({
        readerId,
        fingerprint: 'shared',
        certificate: { serial: '0e', notAfter: new Date() },
        actorId: 1,
        previousCredentialBecomes: 'revoked',
      });
    await expect(pair(7)).rejects.toThrow('PairingKeyInUse');
    expect(rows.get(7)?.pairingState).toBe('revoked');
    expect(events()).toEqual([]);
    // The same record with the same key again is not a second reader.
    await expect(pair(6)).resolves.toMatchObject({ previousFingerprint: null });
  });

  const markPaired = (readerId: number, fingerprint: string, previousCredentialBecomes: 'revoked' | 'replaced') =>
    service.markPaired({
      readerId,
      fingerprint,
      certificate: { serial: '0f', notAfter: new Date(Date.now() + 1e9) },
      actorId: 1,
      previousCredentialBecomes,
    });

  it('puts a replaced credential back, appending to the history, when the approval is undone', async () => {
    const notAfter = new Date('2027-01-01T00:00:00Z');
    const pairedAt = new Date('2026-01-01T00:00:00Z');
    seed(8, { ...paired(8, 'old'), certificateNotAfter: notAfter, pairedAt });
    const { before } = await markPaired(8, 'new', 'replaced');
    expect(await service.isActive(8, 'new')).toBe(true);

    await expect(service.undoPairing({ readerId: 8, fingerprint: 'new', before, actorId: 1 })).resolves.toBe(true);
    expect(rows.get(8)).toMatchObject({
      pairingState: 'paired',
      credentialFingerprint: 'old',
      certificateSerial: '0a',
      certificateNotAfter: notAfter,
      pairedAt,
    });
    expect(await service.isActive(8, 'old')).toBe(true);
    expect(await service.isActive(8, 'new')).toBe(false);
    expect(events().map((e) => [e['state'], e['keyFingerprint'], e['certificateSerial']])).toEqual([
      ['replaced', 'old', '0a'],
      ['paired', 'new', '0f'],
      ['revoked', 'new', '0f'],
      ['paired', 'old', '0a'],
    ]);
  });

  it('puts a record without a credential back when the approval is undone', async () => {
    seed(9, { id: 9, name: 'reader-9', pairingState: 'revoked', credentialFingerprint: null });
    const { before } = await markPaired(9, 'new', 'revoked');
    await service.undoPairing({ readerId: 9, fingerprint: 'new', before, actorId: 1 });
    expect(rows.get(9)).toMatchObject({ pairingState: 'revoked', credentialFingerprint: null });
    expect(events().map((e) => e['state'])).toEqual(['paired', 'revoked']);
  });

  it('undoes nothing once another change replaced the key the approval wrote', async () => {
    seed(10, paired(10, 'old'));
    const { before } = await markPaired(10, 'new', 'replaced');
    await markPaired(10, 'newer', 'replaced');
    store.events.length = 0;
    await expect(service.undoPairing({ readerId: 10, fingerprint: 'new', before, actorId: 1 })).resolves.toBe(false);
    expect(rows.get(10)).toMatchObject({ pairingState: 'paired', credentialFingerprint: 'newer' });
    expect(events()).toEqual([]);
  });

  it('records a renewed certificate only while the key is still the active credential', async () => {
    seed(5, paired(5, 'fp'));
    await service.recordCertificate(5, 'fp', { serial: '0c', notAfter: new Date() });
    expect(rows.get(5)?.certificateSerial).toBe('0c');
    seed(5, { ...paired(5, 'fp'), pairingState: 'revoked', certificateNotAfter: null });
    await service.recordCertificate(5, 'fp', { serial: '0d', notAfter: new Date() });
    expect(rows.get(5)).toMatchObject({ certificateSerial: '0a', certificateNotAfter: null });
  });

  it('forgets a deleted reader', async () => {
    seed(4, paired(4, 'fp'));
    expect(await service.isActive(4, 'fp')).toBe(true);
    rows.delete(4);
    service.onReaderDeleted(new ReaderDeletedEvent(4));
    expect(await service.isActive(4, 'fp')).toBe(false);
  });

  describe('with several API instances (ATT-1163)', () => {
    afterEach(() => jest.restoreAllMocks());

    /** A revoke made on another instance whose message never arrived here: only the row changes. */
    const revokedElsewhere = (id: number) => seed(id, { ...paired(id, 'fp'), pairingState: 'revoked' });

    it('reads a cached credential again once it is older than the cluster cache age', async () => {
      const clustered = new CredentialRegistryService(store, new FakeUnitOfWork(), { enabled: true } as ClusterService);
      const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      seed(6, paired(6, 'fp'));
      expect(await clustered.isActive(6, 'fp')).toBe(true);
      revokedElsewhere(6);

      now.mockReturnValue(1_000_000 + CLUSTER_CREDENTIAL_CACHE_MS - 1);
      expect(await clustered.isActive(6, 'fp')).toBe(true);
      now.mockReturnValue(1_000_000 + CLUSTER_CREDENTIAL_CACHE_MS);
      expect(await clustered.isActive(6, 'fp')).toBe(false);
      expect(store.reads).toBe(2);
    });

    it('keeps the cache until an invalidation when this is the only instance', async () => {
      const single = new CredentialRegistryService(store, new FakeUnitOfWork(), { enabled: false } as ClusterService);
      const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      seed(7, paired(7, 'fp'));
      expect(await single.isActive(7, 'fp')).toBe(true);
      revokedElsewhere(7);

      now.mockReturnValue(1_000_000 + 24 * 60 * 60_000);
      expect(await single.isActive(7, 'fp')).toBe(true);
      expect(store.reads).toBe(1);
    });

    it('checks the database, not the cache, for a recheck', async () => {
      seed(8, paired(8, 'fp'));
      expect(await service.isActive(8, 'fp')).toBe(true);
      revokedElsewhere(8);

      expect(await service.isActiveNow(8, 'fp')).toBe(false);
      expect(await service.isActiveNow(8, 'other')).toBe(false);
      seed(8, paired(8, 'fp'));
      expect(await service.isActiveNow(8, 'fp')).toBe(true);
    });
  });
});
