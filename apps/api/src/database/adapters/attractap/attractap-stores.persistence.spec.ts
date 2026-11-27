import {
  Attractap,
  AttractapCrashReport,
  AttractapInstallation,
  NFCCard,
  NFCCardPendingChange,
  Resource,
  User,
} from '@attraccess/database-entities';
import { ResourceType } from '@attraccess/application-models';
import { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';

import { CardAlreadyEnrolledError } from '../../../attractap/card-store.port';
import { TypeOrmAttractapCardStore } from './typeorm-card.store';
import { TypeOrmAttractapCrashReportStore } from './typeorm-crash-report.store';
import { TypeOrmAttractapInstallationStore } from './typeorm-installation.store';
import { TypeOrmAttractapReaderStore } from './typeorm-reader.store';
import { TypeOrmAttractapResourceReads } from './typeorm-resource-reads';

/** Mapping and write behaviour of the Attractap adapters against the real entity metadata. */
describe('Attractap persistence adapters on PostgreSQL', () => {
  let source: DataSource;

  beforeAll(async () => {
    source = await createTestDataSource();
  });

  afterAll(async () => {
    await closeTestDataSource(source);
  });

  describe('reader store', () => {
    const store = () =>
      new TypeOrmAttractapReaderStore(source.getRepository(Attractap), source.getRepository(Resource));

    it('maps a reader and its firmware without engine objects and writes only editable columns', async () => {
      const resources = source.getRepository(Resource);
      const lathe = await resources.save({ name: 'Lathe', type: ResourceType.Machine });
      const mill = await resources.save({ name: 'Mill', type: ResourceType.Machine });
      const readers = store();
      const created = await readers.create({ name: 'abcd' });

      expect(created).toMatchObject({ name: 'abcd', pairingState: 'revoked', ledBrightness: 255 });
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
        firmware: { version: '2.0.1' },
      });
      expect(read.resources.map((r) => r.name).sort()).toEqual(['Lathe', 'Mill']);
      expect(read.resources[0]).not.toHaveProperty('billingConfigurations');

      await readers.applyEdit(created.id, { resourceIds: [] });
      expect((await readers.findById(created.id)).resources).toEqual([]);
      expect(await readers.delete(created.id)).toBe(true);
      expect(await readers.delete(created.id)).toBe(false);
    });

    it('keeps the BLE Bridge flag (capabilities.nfc) of the firmware', async () => {
      const readers = store();
      const created = await readers.create({ apiTokenHash: 'bridge-hash', name: 'bridge' });
      expect(created.firmware.capabilities.nfc).toBe(true);

      const capabilities = { ...created.firmware.capabilities, nfc: false };
      await readers.applyEdit(created.id, { firmware: { ...created.firmware, capabilities }, allowPluginBle: true });

      const read = await readers.findById(created.id);
      expect(read.firmware.capabilities.nfc).toBe(false);
      expect(read.allowPluginBle).toBe(true);
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

    it('stores a UID-only card without key and finds it by UID in any letter case', async () => {
      const user = await source.getRepository(User).save({ username: 'uidonly', email: 'uidonly@example.test' });
      const cards = store();

      const created = await cards.create(
        user,
        { uid: '04a1b2c3d4e5f6', type: 'uid-only', keyNo: null, key: null },
        true,
      );

      expect(created).toMatchObject({ type: 'uid-only', keyNo: null, key: null, isActive: true });
      expect((await cards.findByUid('04A1B2C3D4E5F6'))?.id).toBe(created.id);
      expect((await cards.findByUid('04a1b2c3d4e5f6'))?.user.id).toBe(user.id);
      expect(await cards.findByUid('04a1b2c3d4e5f7')).toBeUndefined();
      const secure = await cards.create(user, { uid: '0f0f', keyNo: 1, key: 'k' }, false);
      expect(secure.type).toBe('aes');
    });

    it('switches the other cards of the owner off in the same transaction that stores the new one', async () => {
      const user = await source.getRepository(User).save({ username: 'owner', email: 'owner@example.test' });
      const cards = store();
      const first = await cards.create(user, { uid: '01', keyNo: 1, key: 'k1' }, true);
      // The owner is the caller's user projected to the owner fields, the same shape a lookup returns.
      expect(first.user).toEqual((await cards.findById(first.id)).user);
      expect(first).toMatchObject({ isActive: true, user: { id: user.id, username: 'owner' } });
      expect(first.user).not.toHaveProperty('passwordResetToken');

      const second = await cards.create(user, { uid: '02', keyNo: 1, key: 'k2' }, true);
      expect(second.isActive).toBe(true);
      expect((await cards.findById(first.id)).isActive).toBe(false);

      // A card enrolled while another is active stays inactive and leaves the active one alone.
      const third = await cards.create(user, { uid: '03', keyNo: 1, key: 'k3' }, false);
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

    it('leaves one active card when activations of the same owner overlap', async () => {
      const user = await source.getRepository(User).save({ username: 'racer', email: 'racer@example.test' });
      const cards = store();
      const enrolled = await Promise.all(
        ['11', '12', '13', '14'].map((uid) => cards.create(user, { uid, keyNo: 1, key: `k${uid}` }, false)),
      );

      await Promise.all([
        ...enrolled.map((card) => cards.activateExclusively(card.id)),
        cards.create(user, { uid: '15', keyNo: 1, key: 'k15' }, true),
      ]);

      expect((await cards.listForUser(user.id)).filter((card) => card.isActive)).toHaveLength(1);
    });

    it("refuses a second card of a UID in any letter case and leaves the owner's active card on", async () => {
      const user = await source.getRepository(User).save({ username: 'dup', email: 'dup@example.test' });
      const other = await source.getRepository(User).save({ username: 'dup2', email: 'dup2@example.test' });
      const cards = store();
      const active = await cards.create(user, { uid: '04dd0001', keyNo: 1, key: 'k' }, true);
      await cards.create(other, { uid: '04ee0001', keyNo: 1, key: 'k' }, false);

      await expect(cards.create(user, { uid: '04EE0001', keyNo: 2, key: 'k2' }, true)).rejects.toBeInstanceOf(
        CardAlreadyEnrolledError,
      );

      // The failed transaction rolled back: the owner's card was not switched off, nothing was added.
      expect((await cards.findById(active.id)).isActive).toBe(true);
      expect((await cards.listForUser(user.id)).map((card) => card.uid)).toEqual(['04dd0001']);
    });

    it('records one card when two enrollments of the same UID overlap', async () => {
      const user = await source.getRepository(User).save({ username: 'race2', email: 'race2@example.test' });
      const cards = store();

      const results = await Promise.allSettled(
        ['04ff0001', '04FF0001', '04Ff0001'].map((uid) => cards.create(user, { uid, keyNo: 1, key: 'k' }, true)),
      );

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      for (const result of results.filter((result) => result.status === 'rejected')) {
        expect((result as PromiseRejectedResult).reason).toBeInstanceOf(CardAlreadyEnrolledError);
      }
      expect((await cards.listForUser(user.id)).filter((card) => card.isActive)).toHaveLength(1);
    });

    it('lets other failures of a card insert through unchanged', async () => {
      const cards = store();
      const ghost = { id: 999_999, username: 'ghost', email: 'ghost@example.test' } as User;

      const failure = await cards.create(ghost, { uid: '04ab0001', keyNo: 1, key: 'k' }, false).catch((e) => e);

      expect(failure).not.toBeInstanceOf(CardAlreadyEnrolledError);
      expect(failure.driverError?.code).toBe('23503');
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
      const readerId = (await source.getRepository(Attractap).save({ name: 'r' } as Attractap)).id;
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
        coredumpStatus: 'stored',
        coredumpExpectedSize: null,
        coredumpExpectedCrc32: null,
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

    describe('chunked coredump upload', () => {
      const announced = { size: 43776, crc32: 0xdeadbeef };
      const awaiting = (attractapId: number) => ({
        attractapId,
        resetReason: 'PANIC',
        rebootReason: null,
        heapFreeBytes: null,
        largestFreeBlockBytes: null,
        uptimeBeforeResetMs: null,
        wsState: null,
        wifiState: null,
        firmwareVersion: null,
        coredumpSize: null,
        coredump: null,
        coredumpStatus: 'awaiting' as const,
        coredumpExpectedSize: announced.size,
        coredumpExpectedCrc32: announced.crc32,
        symbolicationStatus: null,
      });
      const newReader = async () => (await source.getRepository(Attractap).save({ name: 'r' } as Attractap)).id;

      it('keeps an unsigned CRC-32 above 2^31 and finds the awaiting report by it', async () => {
        const readerId = await newReader();
        const store = new TypeOrmAttractapCrashReportStore(source.getRepository(AttractapCrashReport));
        const created = await store.create(awaiting(readerId));
        expect(created).toMatchObject({
          coredumpStatus: 'awaiting',
          coredumpExpectedSize: 43776,
          coredumpExpectedCrc32: 0xdeadbeef,
        });

        expect((await store.findAwaiting(readerId, announced))?.id).toBe(created.id);
        expect(await store.findAwaiting(readerId, { ...announced, crc32: 0x5eadbeef })).toBeNull();
        expect(await store.findAwaiting(readerId + 1000, announced)).toBeNull();
      });

      it('returns the newest awaiting report for the same announcement', async () => {
        const readerId = await newReader();
        const store = new TypeOrmAttractapCrashReportStore(source.getRepository(AttractapCrashReport));
        await store.create(awaiting(readerId));
        const newest = await store.create(awaiting(readerId));
        expect((await store.findAwaiting(readerId, announced))?.id).toBe(newest.id);
      });

      it('finds a report only for the reader that owns it', async () => {
        const readerId = await newReader();
        const store = new TypeOrmAttractapCrashReportStore(source.getRepository(AttractapCrashReport));
        const created = await store.create(awaiting(readerId));
        expect((await store.findOfReader(created.id, readerId))?.id).toBe(created.id);
        expect(await store.findOfReader(created.id, readerId + 1000)).toBeNull();
      });

      it('stores an uploaded dump only while its report awaits one', async () => {
        const readerId = await newReader();
        const store = new TypeOrmAttractapCrashReportStore(source.getRepository(AttractapCrashReport));
        const created = await store.create(awaiting(readerId));
        const dump = Buffer.alloc(announced.size, 7);

        expect(await store.storeAwaitedCoredump(created, dump)).toBe(true);
        expect(await store.storeAwaitedCoredump(created, Buffer.alloc(10))).toBe(false);
        expect(await store.storeAwaitedCoredump({ id: created.id, attractapId: readerId + 1000 }, dump)).toBe(false);

        expect(Buffer.from(await store.findCoredump(readerId, created.id)).equals(dump)).toBe(true);
        expect(await store.findOfReader(created.id, readerId)).toMatchObject({
          coredumpStatus: 'stored',
          coredumpSize: announced.size,
          symbolicationStatus: 'pending',
        });
        // A stored report is no longer the target of repeated metadata.
        expect(await store.findAwaiting(readerId, announced)).toBeNull();
      });
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
