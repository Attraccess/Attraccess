import { Attractap, AttractapCredentialEvent } from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { CredentialRegistryService } from '../../../attractap/security/credential-registry.service';
import { PostgresDatabaseFixture } from '../postgres-database.test-fixture';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { TransactionHandles } from '../common/transaction-handles';
import { TypeOrmAttractapCredentialStore } from './typeorm-credential.store';

/**
 * The credential changes on a real PostgreSQL database, through two independent DataSources (two processes' worth of
 * connections): the reader row and its history commit together, and one key never becomes the active credential of
 * two readers, whichever connection asks first.
 */
describe('credential registry on PostgreSQL (atomic reader row and history)', () => {
  let fixture: PostgresDatabaseFixture;

  const connect = async () => {
    const source = await fixture.open();
    const unitOfWork = unitOfWorkFor(source);
    const store = new TypeOrmAttractapCredentialStore(
      source.getRepository(Attractap),
      source.getRepository(AttractapCredentialEvent),
      new TransactionHandles(unitOfWork),
    );
    return { source, store, registry: new CredentialRegistryService(store, unitOfWork) };
  };

  beforeEach(async () => {
    fixture = await PostgresDatabaseFixture.create();
  });

  afterEach(async () => {
    await fixture.close();
  });

  const addReader = async (source: DataSource, name: string) =>
    (await source.getRepository(Attractap).save({ name, apiTokenHash: `hash-${name}` } as Attractap)).id;
  const certificate = { serial: '0a', notAfter: new Date('2030-01-01T00:00:00Z') };
  const events = async (source: DataSource) =>
    (await source.getRepository(AttractapCredentialEvent).find({ order: { id: 'ASC' } })).map((e) => [
      e.readerId,
      e.state,
      e.keyFingerprint,
    ]);

  it('writes the credential and its history entry together', async () => {
    const { source, registry } = await connect();
    const readerId = await addReader(source, 'one');

    await registry.markPaired({
      readerId,
      fingerprint: 'fp-1',
      certificate,
      actorId: 3,
      previousCredentialBecomes: 'revoked',
    });

    const row = await source.getRepository(Attractap).findOneByOrFail({ id: readerId });
    expect(row).toMatchObject({ pairingState: 'paired', credentialFingerprint: 'fp-1', apiTokenHash: '' });
    expect(await events(source)).toEqual([[readerId, 'paired', 'fp-1']]);
  });

  it('leaves neither a credential nor a history entry behind when the change fails halfway', async () => {
    const { source, store, registry } = await connect();
    const readerId = await addReader(source, 'one');
    const original = store.appendEvent.bind(store);
    let calls = 0;
    jest.spyOn(store, 'appendEvent').mockImplementation(async (scope, event) => {
      if (++calls === 2) throw new Error('disk full');
      await original(scope, event);
    });

    // Pair, then re-pair with another key: the second call writes the closing and the opening entry, and dies
    // between them.
    await registry.markPaired({
      readerId,
      fingerprint: 'old',
      certificate,
      actorId: 1,
      previousCredentialBecomes: 'replaced',
    });
    calls = 0;
    await expect(
      registry.markPaired({
        readerId,
        fingerprint: 'new',
        certificate,
        actorId: 1,
        previousCredentialBecomes: 'replaced',
      }),
    ).rejects.toThrow('disk full');

    const row = await source.getRepository(Attractap).findOneByOrFail({ id: readerId });
    expect(row.credentialFingerprint).toBe('old');
    expect(await events(source)).toEqual([[readerId, 'paired', 'old']]);
    // The registry does not serve the state of the failed change from its cache.
    expect(await registry.isActive(readerId, 'old')).toBe(true);
    expect(await registry.isActive(readerId, 'new')).toBe(false);
  });

  it('lets exactly one of two connections make a key the credential, whoever asks first', async () => {
    const first = await connect();
    const second = await connect();
    const a = await addReader(first.source, 'a');
    const b = await addReader(first.source, 'b');
    const pair = (registry: CredentialRegistryService, readerId: number) =>
      registry.markPaired({
        readerId,
        fingerprint: 'shared-key',
        certificate,
        actorId: 1,
        previousCredentialBecomes: 'revoked',
      });

    const results = await Promise.allSettled([pair(first.registry, a), pair(second.registry, b)]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.message).toBe('PairingKeyInUse');
    const holders = await first.source
      .getRepository(Attractap)
      .find({ where: { credentialFingerprint: 'shared-key' } });
    expect(holders).toHaveLength(1);
    expect(await events(first.source)).toHaveLength(1);
    expect(await first.registry.findPairedReaderByFingerprint('shared-key')).toBe(holders[0].id);
  });

  it('revokes with its history entry in one change and refuses a second revoke', async () => {
    const { source, registry } = await connect();
    const readerId = await addReader(source, 'one');
    await registry.markPaired({
      readerId,
      fingerprint: 'fp',
      certificate,
      actorId: 1,
      previousCredentialBecomes: 'revoked',
    });

    await registry.revoke(readerId, 9);
    await expect(registry.revoke(readerId, 9)).rejects.toThrow('not paired');

    const row = await source.getRepository(Attractap).findOneByOrFail({ id: readerId });
    expect(row).toMatchObject({ pairingState: 'revoked', certificateNotAfter: null });
    expect(await events(source)).toEqual([
      [readerId, 'paired', 'fp'],
      [readerId, 'revoked', 'fp'],
    ]);
    expect((await registry.history(readerId)).map((e) => e.state)).toEqual(['revoked', 'paired']);
  });

  it('gives a token reader its token back when the pairing is undone', async () => {
    const { source, registry } = await connect();
    const readerId = await addReader(source, 'one');
    const { before } = await registry.markPaired({
      readerId,
      fingerprint: 'fp',
      certificate,
      actorId: 1,
      previousCredentialBecomes: 'revoked',
    });

    await expect(registry.undoPairing({ readerId, fingerprint: 'fp', before, actorId: 1 })).resolves.toBe(true);

    const row = await source.getRepository(Attractap).findOneByOrFail({ id: readerId });
    expect(row).toMatchObject({ pairingState: 'unpaired', credentialFingerprint: null, apiTokenHash: 'hash-one' });
  });
});
