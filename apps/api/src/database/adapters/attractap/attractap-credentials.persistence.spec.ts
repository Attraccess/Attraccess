import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Attractap, AttractapCredentialEvent, entities, Resource } from '@attraccess/database-entities';
import { DataSource, Table } from 'typeorm';
import { CredentialRegistryService } from '../../../attractap/security/credential-registry.service';
import { sqliteBackend } from '../../sqlite/sqlite-backend';
import { createSqliteUnitOfWork } from '../../sqlite/sqlite-unit-of-work';
import { TransactionHandles } from '../common/transaction-handles';
import { TypeOrmAttractapCredentialStore } from './typeorm-credential.store';
import { TypeOrmAttractapReaderStore } from './typeorm-reader.store';

/**
 * The credential changes on a real SQLite file, through two independent DataSources (two processes' worth of
 * connections): the reader row and its history commit together, and one key never becomes the active credential of
 * two readers, whichever connection asks first.
 */
describe('credential registry on SQLite (atomic reader row and history)', () => {
  let directory: string;
  const sources: DataSource[] = [];

  const open = async (): Promise<DataSource> => {
    const source = await sqliteBackend
      .createDataSource({
        type: 'better-sqlite3',
        invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
        database: join(directory, 'credentials.sqlite'),
        entities: Object.values(entities),
      })
      .initialize();
    sources.push(source);
    return source;
  };

  const connect = async () => {
    const source = await open();
    const unitOfWork = createSqliteUnitOfWork(source);
    const store = new TypeOrmAttractapCredentialStore(
      source.getRepository(Attractap),
      source.getRepository(AttractapCredentialEvent),
      new TransactionHandles(unitOfWork),
    );
    return { source, store, registry: new CredentialRegistryService(store, unitOfWork) };
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'credentials-'));
    const setup = await open();
    const readers = setup.getMetadata(Attractap);
    const tables = [
      setup.getMetadata(Resource),
      readers,
      ...readers.manyToManyRelations.flatMap((relation) => relation.junctionEntityMetadata ?? []),
      setup.getMetadata(AttractapCredentialEvent),
    ];
    const queryRunner = setup.createQueryRunner();
    try {
      for (const table of tables) await queryRunner.createTable(Table.create(table, setup.driver));
    } finally {
      await queryRunner.release();
    }
  });

  afterEach(async () => {
    for (const source of sources.splice(0)) {
      await sqliteBackend.shutdown(source);
      if (source.isInitialized) await source.destroy();
    }
    await rm(directory, { recursive: true, force: true });
  });

  const addReader = async (source: DataSource, name: string) =>
    (await source.getRepository(Attractap).save({ name } as Attractap)).id;
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
    expect(row).toMatchObject({ pairingState: 'paired', credentialFingerprint: 'fp-1' });
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

  it('clears secured when the credential is revoked or replaced, and keeps the other security columns', async () => {
    const { source, registry } = await connect();
    const readerId = await addReader(source, 'one');
    const readers = new TypeOrmAttractapReaderStore(source.getRepository(Attractap), source.getRepository(Resource));
    const pair = (fingerprint: string) =>
      registry.markPaired({ readerId, fingerprint, certificate, actorId: 1, previousCredentialBecomes: 'replaced' });
    await pair('fp');
    const checkedAt = new Date('2026-11-18T10:00:00Z');
    await readers.applySecurity(readerId, {
      secured: true,
      securedAt: checkedAt,
      firmwareProfile: 'secure',
      efuseSecureVersion: 1,
      securityReportCheckedAt: checkedAt,
      securityReportProblems: [],
    });
    expect(await readers.findById(readerId)).toMatchObject({
      secured: true,
      firmwareProfile: 'secure',
      securityReportProblems: [],
    });

    await pair('fp-new'); // another key: it has to pass the report check again
    expect(await readers.findById(readerId)).toMatchObject({
      secured: false,
      securedAt: null,
      firmwareProfile: 'secure',
      efuseSecureVersion: 1,
      securityReportCheckedAt: checkedAt,
    });
    await readers.applySecurity(readerId, { secured: true, securedAt: checkedAt });
    await registry.revoke(readerId, 9);
    expect(await readers.findById(readerId)).toMatchObject({ secured: false, securedAt: null });
  });

  it('writes the security columns only while the session key is the credential', async () => {
    const { source, registry } = await connect();
    const readerId = await addReader(source, 'one');
    const readers = new TypeOrmAttractapReaderStore(source.getRepository(Attractap), source.getRepository(Resource));
    await registry.markPaired({
      readerId,
      fingerprint: 'fp',
      certificate,
      actorId: 1,
      previousCredentialBecomes: 'replaced',
    });

    expect(await readers.applySecurity(readerId, { secured: true }, 'someone-else')).toBe(false);
    expect((await readers.findById(readerId))?.secured).toBe(false);
    expect(await readers.applySecurity(readerId, { secured: true }, 'fp')).toBe(true);
    await registry.revoke(readerId, 9);
    expect(await readers.applySecurity(readerId, { secured: true }, 'fp')).toBe(false);
  });

  it('puts the record back to its state before the pairing when the pairing is undone', async () => {
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
    expect(row).toMatchObject({ pairingState: 'revoked', credentialFingerprint: null });
  });
});
