import {
  Attractap,
  AttractapCrashReport,
  AttractapInstallation,
  entities,
  NFCCard,
  NFCCardPendingChange,
  Resource,
  User,
} from '@attraccess/database-entities';
import { ResourceType } from '@attraccess/application-models';
import { DataSource, Table } from 'typeorm';
import { TypeOrmAttractapCardStore } from './typeorm-card.store';
import { TypeOrmAttractapCrashReportStore } from './typeorm-crash-report.store';
import { TypeOrmAttractapInstallationStore } from './typeorm-installation.store';
import { TypeOrmAttractapReaderStore } from './typeorm-reader.store';
import { TypeOrmAttractapResourceReads } from './typeorm-resource-reads';

/** Mapping and write behaviour of the Attractap adapters against the real entity metadata. */
describe('Attractap persistence adapters on SQLite', () => {
  let source: DataSource;

  beforeAll(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
    }).initialize();
    const readers = source.getMetadata(Attractap);
    const tables = [
      source.getMetadata(User),
      source.getMetadata(Resource),
      readers,
      ...readers.manyToManyRelations.flatMap((relation) => relation.junctionEntityMetadata ?? []),
      source.getMetadata(AttractapCrashReport),
      source.getMetadata(AttractapInstallation),
      source.getMetadata(NFCCard),
      source.getMetadata(NFCCardPendingChange),
    ];
    const queryRunner = source.createQueryRunner();
    try {
      for (const table of tables) await queryRunner.createTable(Table.create(table, source.driver));
    } finally {
      await queryRunner.release();
    }
  });

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  describe('reader store', () => {
    const store = () =>
      new TypeOrmAttractapReaderStore(source.getRepository(Attractap), source.getRepository(Resource));

    it('maps a reader and its firmware without engine objects and writes only editable columns', async () => {
      const resources = source.getRepository(Resource);
      const lathe = await resources.save({ name: 'Lathe', type: ResourceType.Machine });
      const mill = await resources.save({ name: 'Mill', type: ResourceType.Machine });
      const readers = store();
      const created = await readers.create({ apiTokenHash: 'secret-hash', name: 'abcd' });

      expect(created).toMatchObject({ name: 'abcd', pairingState: 'unpaired', ledBrightness: 255 });
      expect(created.firmware.capabilities).toMatchObject({ resourceSelection: true, cardRelay: false });

      // A pairing that lands after the editor read the reader must not be undone by the edit.
      await source.getRepository(Attractap).update(created.id, { pairingState: 'paired', credentialFingerprint: 'fp' });
      await readers.applyEdit(created.id, {
        name: 'renamed',
        ledBrightness: 10,
        firmware: { ...created.firmware, version: '2.0.1' },
        resourceIds: [lathe.id, mill.id],
      });

      const read = await readers.findById(created.id);
      expect(read).toMatchObject({
        name: 'renamed',
        ledBrightness: 10,
        pairingState: 'paired',
        credentialFingerprint: 'fp',
        apiTokenHash: 'secret-hash',
        firmware: { version: '2.0.1' },
      });
      expect(read.resources.map((r) => r.name).sort()).toEqual(['Lathe', 'Mill']);
      expect(read.resources[0]).not.toHaveProperty('billingConfigurations');

      await readers.applyEdit(created.id, { resourceIds: [] });
      expect((await readers.findById(created.id)).resources).toEqual([]);
      expect(await readers.delete(created.id)).toBe(true);
      expect(await readers.delete(created.id)).toBe(false);
    });

    it('finds only the resources that exist', async () => {
      const lathe = await source.getRepository(Resource).save({ name: 'Press', type: ResourceType.Machine });
      expect((await store().findResourcesByIds([lathe.id, 9999])).map((r) => r.name)).toEqual(['Press']);
      expect(await store().findResourcesByIds([])).toEqual([]);
    });
  });

  describe('card store', () => {
    const store = () =>
      new TypeOrmAttractapCardStore(source.getRepository(NFCCard), source.getRepository(NFCCardPendingChange));

    it('switches the other cards of the owner off in the same transaction that stores the new one', async () => {
      const user = await source.getRepository(User).save({ username: 'owner', email: 'owner@example.test' });
      const cards = store();
      const first = await cards.create(user.id, { uid: '01', keyNo: 1, key: 'k1' }, true);
      expect(first).toMatchObject({ isActive: true, user: { id: user.id, username: 'owner' } });

      const second = await cards.create(user.id, { uid: '02', keyNo: 1, key: 'k2' }, true);
      expect(second.isActive).toBe(true);
      expect((await cards.findById(first.id)).isActive).toBe(false);

      // A card enrolled while another is active stays inactive and leaves the active one alone.
      const third = await cards.create(user.id, { uid: '03', keyNo: 1, key: 'k3' }, false);
      expect(third.isActive).toBe(false);
      expect((await cards.findById(second.id)).isActive).toBe(true);
      expect(await cards.userHasActiveCard(user.id)).toBe(true);

      const activated = await cards.activateExclusively(third.id);
      expect(activated.isActive).toBe(true);
      expect((await cards.listForUser(user.id)).filter((c) => c.isActive).map((c) => c.uid)).toEqual(['03']);
      // Listing for a user does not load the owner, as before.
      expect((await cards.listForUser(user.id))[0]).not.toHaveProperty('user');

      await expect(cards.activateExclusively(99999)).rejects.toThrow('not found');
      await cards.deactivate(third.id);
      expect(await cards.userHasActiveCard(user.id)).toBe(false);
      expect(await cards.delete(third.id)).toBe(true);
      expect(await cards.delete(third.id)).toBe(false);
    });

    it('keeps pending key changes apart by kind and removes them by id or uid', async () => {
      const cards = store();
      const enroll = await cards.savePending({
        uid: 'AA',
        kind: 'enroll',
        userId: 1,
        cardId: null,
        keyNo: 1,
        key: 'enc',
        actorId: 2,
      });
      await cards.savePending({ uid: 'AA', kind: 'reset', userId: null, cardId: 5, keyNo: 1, key: null, actorId: 2 });

      expect((await cards.findPendingEnroll('AA'))?.id).toBe(enroll.id);
      expect(await cards.listPendingResets('AA')).toHaveLength(1);
      await cards.deletePendingByUid('AA', 'reset');
      expect(await cards.listPendingResets('AA')).toHaveLength(0);
      expect(await cards.listPendingEnrolls('AA')).toHaveLength(1);
      await cards.deletePendingById(enroll.id);
      expect(await cards.findPendingEnroll('AA')).toBeNull();
    });
  });

  describe('crash report store', () => {
    it('keeps the coredump out of listings and serves it on its own', async () => {
      const readerId = (await source.getRepository(Attractap).save({ name: 'r', apiTokenHash: 'h' } as Attractap)).id;
      const store = new TypeOrmAttractapCrashReportStore(source.getRepository(AttractapCrashReport));
      const report = await store.create({
        attractapId: readerId,
        resetReason: 'PANIC',
        rebootReason: null,
        heapFreeBytes: 1,
        largestFreeBlockBytes: null,
        uptimeBeforeResetMs: null,
        wsState: null,
        wifiState: null,
        firmwareVersion: '1.0',
        coredumpSize: 4,
        coredump: Buffer.from('dump'),
        symbolicationStatus: 'pending',
      });
      await store.updateSymbolication(report.id, {
        coredumpBuildId: 'abc',
        symbolicationStatus: 'success',
        symbolizedBacktrace: '#0',
      });

      const [listed] = await store.listForReader(readerId);
      expect(listed).toMatchObject({ coredumpBuildId: 'abc', symbolicationStatus: 'success', coredump: null });
      expect(Buffer.from(await store.findCoredump(readerId, report.id)).toString()).toBe('dump');
      expect(await store.findCoredump(readerId + 1, report.id)).toBeNull();
    });
  });

  describe('installation store', () => {
    it('keeps one installation identity and replaces it on save', async () => {
      const store = new TypeOrmAttractapInstallationStore(source.getRepository(AttractapInstallation));
      expect(await store.find()).toBeNull();
      const record = {
        installationId: 'id-1',
        caCertificatePem: 'ca',
        caPrivateKeyEncrypted: 'enc-ca',
        serverCertificatePem: 'srv',
        serverPrivateKeyEncrypted: 'enc-srv',
        serverCertificateNotAfter: new Date('2030-01-01T00:00:00Z'),
      };
      await store.save(record);
      await store.save({ ...record, serverCertificatePem: 'srv-2' });
      expect(await store.find()).toEqual({ ...record, serverCertificatePem: 'srv-2' });
      expect(await source.getRepository(AttractapInstallation).count()).toBe(1);
    });
  });

  describe('resource reads', () => {
    it('finds a resource and treats a failed active-usage read as idle', async () => {
      const resource = await source.getRepository(Resource).save({ name: 'Saw', type: ResourceType.Machine });
      const failing = { find: jest.fn().mockRejectedValue(new Error('database gone')) };
      const reads = new TypeOrmAttractapResourceReads(source.getRepository(Resource), failing as never);

      expect(await reads.findResource(resource.id)).toMatchObject({
        id: resource.id,
        name: 'Saw',
        type: ResourceType.Machine,
      });
      expect(await reads.findResource(99999)).toBeNull();
      expect((await reads.findResourceIdsWithActiveUsage([1])).size).toBe(0);
      expect((await reads.findResourceIdsWithActiveUsage([])).size).toBe(0);
      expect(failing.find).toHaveBeenCalledTimes(1);
    });
  });
});
