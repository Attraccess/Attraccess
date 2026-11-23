import { AttractapSecureConversion } from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { TypeOrmAttractapSecureConversionStore } from './typeorm-secure-conversion.store';

const target = {
  firmwareName: 'attractap',
  variant: 'touch-v2',
  version: '2.14.0',
  secureVersion: 1,
  appSha256: 'a'.repeat(64),
  appSize: 8192,
  bootloaderSha256: 'b'.repeat(64),
  bootloaderSize: 4096,
};
const conversion = (readerId: number) => ({
  readerId,
  target,
  digest0: '1'.repeat(64),
  digest1: '2'.repeat(64),
  preflight: null,
  actorId: 3,
});

/** The conversion store against PostgreSQL: the one-active index and the compare-and-set transitions. */
describe('secure conversion store on PostgreSQL', () => {
  let source: DataSource;
  let store: TypeOrmAttractapSecureConversionStore;

  beforeAll(async () => {
    source = await createTestDataSource();
    store = new TypeOrmAttractapSecureConversionStore(source.getRepository(AttractapSecureConversion));
  });

  afterAll(async () => {
    await closeTestDataSource(source);
  });

  it('keeps one active conversion per installation and moves states only from the expected ones', async () => {
    const at = new Date('2026-11-23T10:00:00Z');
    const first = await store.insert(conversion(1), at);
    expect(first).toMatchObject({ readerId: 1, state: 'preflight', target, verified: false, bytesDone: 0 });
    await expect(store.insert(conversion(2), at)).resolves.toBeNull();

    // Compare and set: a transition from a state the row is not in does nothing.
    await expect(store.update(first!.id, { state: 'digests-burned' }, ['transferring'])).resolves.toBeNull();
    const moved = await store.update(
      first!.id,
      { state: 'transferring', bytesTotal: 12288, preflight: [{ check: 'chip', ok: true, value: 'esp32s3 v0.2' }] },
      ['preflight'],
    );
    expect(moved).toMatchObject({ state: 'transferring', bytesTotal: 12288, preflight: [{ check: 'chip' }] });
    await expect(store.findActive()).resolves.toMatchObject({ id: first!.id });

    // A terminal state ends the conversion: another one may start.
    const burnReport = { mac: 'dc:b4:d9:21:71:c8', digest0: '1'.repeat(64), digest1: '2'.repeat(64) };
    await store.update(
      first!.id,
      { state: 'failed', failedInState: 'transferring', failureReason: 'digest-mismatch', burnReport, endedAt: at },
      ['transferring'],
    );
    await expect(store.findActive()).resolves.toBeNull();
    const second = await store.insert(conversion(2), at);
    expect(second?.readerId).toBe(2);
    await expect(store.findLatestForReader(1)).resolves.toMatchObject({ state: 'failed', burnReport });
    await expect(store.listActiveFor([1, 2])).resolves.toEqual([expect.objectContaining({ id: second!.id })]);
  });
});
