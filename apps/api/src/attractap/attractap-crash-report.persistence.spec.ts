import { DataSource } from 'typeorm';
import { Attractap, AttractapCrashReport, entities } from '@attraccess/database-entities';
import { AttractapService } from './attractap.service';

/** The chunked coredump columns (ATT-1144) through TypeORM against SQLite, as the service uses them. */
describe('AttractapService crash report persistence', () => {
  let source: DataSource;
  let service: AttractapService;
  let readerId: number;
  const symbolicate = jest.fn();

  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      synchronize: true,
    }).initialize();
    const readers = source.getRepository(Attractap);
    readerId = (await readers.save({ name: 'Lathe', apiTokenHash: 'hash' })).id;
    symbolicate.mockReset().mockResolvedValue({ buildId: 'build', status: 'success', backtrace: 'bt' });
    service = new AttractapService(
      {} as never,
      readers,
      source.getRepository(AttractapCrashReport),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { symbolicate } as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });
  afterEach(async () => {
    await source.destroy();
  });

  // Above the signed 32-bit range: the column must keep the unsigned CRC-32 the reader declares.
  const announced = { size: 43776, crc32: 0xdeadbeef };

  it('keeps an unsigned CRC-32 above 2^31 and finds the awaiting report by it', async () => {
    const created = await service.createCrashReport(readerId, { resetReason: 'PANIC' } as never, announced);

    const read = await source.getRepository(AttractapCrashReport).findOneByOrFail({ id: created.id });
    expect(read.coredumpExpectedCrc32).toBe(0xdeadbeef);
    expect(read.coredumpExpectedSize).toBe(43776);
    expect(read.coredumpStatus).toBe('awaiting');

    expect((await service.findAwaitingCrashReport(readerId, announced))?.id).toBe(created.id);
    expect(await service.findAwaitingCrashReport(readerId, { ...announced, crc32: 0x5eadbeef })).toBeNull();
    expect(await service.findAwaitingCrashReport(readerId + 1, announced)).toBeNull();
  });

  it('stores an uploaded dump only while its report awaits one', async () => {
    const created = await service.createCrashReport(readerId, { resetReason: 'PANIC' } as never, announced);
    const report = await service.findCrashReportOfReader(created.id, readerId);
    const dump = Buffer.alloc(announced.size, 7);

    expect(await service.storeUploadedCoredump(report, dump)).toBe(true);
    expect(await service.storeUploadedCoredump({ ...report, coredumpStatus: 'awaiting' }, Buffer.alloc(10))).toBe(
      false,
    );

    const stored = await source
      .getRepository(AttractapCrashReport)
      .findOneOrFail({ where: { id: created.id }, select: { id: true, coredump: true, coredumpStatus: true } });
    expect(stored.coredumpStatus).toBe('stored');
    expect(stored.coredump?.equals(dump)).toBe(true);
    expect(symbolicate).toHaveBeenCalledTimes(1);
    // A stored report is no longer the target of repeated metadata.
    expect(await service.findAwaitingCrashReport(readerId, announced)).toBeNull();
  });
});
