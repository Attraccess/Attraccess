import { Attractap } from '@attraccess/database-entities';
import { ReaderDeletedEvent } from '../events';
import { CredentialRegistryService } from './credential-registry.service';

describe('CredentialRegistryService', () => {
  const rows = new Map<number, Partial<Attractap>>();
  const events: Array<Record<string, unknown>> = [];
  let reads = 0;
  let pendingRead: (() => void) | null = null;
  let service: CredentialRegistryService;

  beforeEach(() => {
    rows.clear();
    events.length = 0;
    reads = 0;
    pendingRead = null;
    const manager = {
      insert: async (_entity: unknown, value: Record<string, unknown>) => void events.push(value),
      update: async (_entity: unknown, id: number, patch: Partial<Attractap>) =>
        void Object.assign(rows.get(id) ?? {}, patch),
      findOne: async (_entity: unknown, { where }: { where: { id: number } }) =>
        rows.has(where.id) ? { ...rows.get(where.id) } : null,
    };
    const readers = {
      findOne: async ({ where }: { where: { id: number } }) => {
        reads++;
        const snapshot = { ...rows.get(where.id) };
        if (pendingRead === null) return snapshot;
        await new Promise<void>((resolve) => (pendingRead = resolve));
        return snapshot;
      },
      update: async (criteria: Partial<Attractap> & { id: number }, patch: Partial<Attractap>) => {
        const row = rows.get(criteria.id);
        const matches = row && Object.entries(criteria).every(([k, v]) => row[k as keyof Attractap] === v);
        if (matches) Object.assign(row, patch);
      },
      manager: { transaction: async (work: (m: typeof manager) => Promise<void>) => work(manager) },
    };
    service = new CredentialRegistryService(readers as never, {} as never);
  });

  const paired = (id: number, fingerprint: string): Partial<Attractap> => ({
    id,
    name: `reader-${id}`,
    pairingState: 'paired',
    credentialFingerprint: fingerprint,
    certificateSerial: '0a',
  });

  it('caches lookups and drops the cache entry on revoke', async () => {
    rows.set(1, paired(1, 'fp'));
    expect(await service.isActive(1, 'fp')).toBe(true);
    expect(await service.isActive(1, 'fp')).toBe(true);
    expect(reads).toBe(1);

    await service.revoke(1, 9);
    expect(await service.isActive(1, 'fp')).toBe(false);
    expect(events).toEqual([
      expect.objectContaining({ state: 'revoked', keyFingerprint: 'fp', certificateSerial: '0a' }),
    ]);
    // Decided on the row inside the transaction: a second revoke finds nothing to revoke.
    await expect(service.revoke(1, 9)).rejects.toThrow('not paired');
    expect(events).toHaveLength(1);
  });

  it('never caches a read that started before an invalidation', async () => {
    rows.set(2, paired(2, 'fp'));
    pendingRead = () => undefined; // the next read waits until released
    const slow = service.isActive(2, 'fp');
    await new Promise((r) => setImmediate(r));
    rows.set(2, { ...paired(2, 'fp'), pairingState: 'revoked' });
    service.invalidate(2);
    (pendingRead as unknown as () => void)();
    pendingRead = null;
    await slow; // saw the old state, but must not have cached it
    expect(await service.isActive(2, 'fp')).toBe(false);
  });

  it('closes the previous credential in the history when a reader is re-paired or replaced', async () => {
    rows.set(3, paired(3, 'old'));
    const result = await service.markPaired({
      readerId: 3,
      fingerprint: 'new',
      certificate: { serial: '0b', notAfter: new Date() },
      actorId: 1,
      previousCredentialBecomes: 'replaced',
    });
    expect(result.previousFingerprint).toBe('old');
    expect(events.map((e) => [e['state'], e['keyFingerprint'], e['certificateSerial']])).toEqual([
      ['replaced', 'old', '0a'],
      ['paired', 'new', '0b'],
    ]);
    expect(rows.get(3)).toMatchObject({ credentialFingerprint: 'new', certificateSerial: '0b', apiTokenHash: '' });
    expect(await service.isActive(3, 'new')).toBe(true);
    expect(await service.isActive(3, 'old')).toBe(false);
  });

  it('records a renewed certificate only while the key is still the active credential', async () => {
    rows.set(5, paired(5, 'fp'));
    await service.recordCertificate(5, 'fp', { serial: '0c', notAfter: new Date() });
    expect(rows.get(5)?.certificateSerial).toBe('0c');
    rows.set(5, { ...paired(5, 'fp'), pairingState: 'revoked', certificateNotAfter: null });
    await service.recordCertificate(5, 'fp', { serial: '0d', notAfter: new Date() });
    expect(rows.get(5)).toMatchObject({ certificateSerial: '0a', certificateNotAfter: null });
  });

  it('forgets a deleted reader', async () => {
    rows.set(4, paired(4, 'fp'));
    expect(await service.isActive(4, 'fp')).toBe(true);
    rows.delete(4);
    service.onReaderDeleted(new ReaderDeletedEvent(4));
    expect(await service.isActive(4, 'fp')).toBe(false);
  });
});
