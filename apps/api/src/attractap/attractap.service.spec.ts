import { DeleteResult, Repository } from 'typeorm';
import { Attractap, AttractapCrashReport, NFCCard, Resource, User } from '@attraccess/database-entities';
import { AttractapService, SYMBOLICATION_CONCURRENCY } from './attractap.service';
import { ReaderUpdatedEvent } from './events';
import { EncryptionService } from '../encryption/encryption.service';
import { MetricsService } from '../metrics/metrics.service';
import { CoredumpSymbolicationService } from './coredump-symbolication.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { NotificationCategory } from '../notifications/notification-types';
import { AttractapFirmwareService } from './firmware.service';

describe.each(['en', 'de', 'de-DE', undefined, 'fr'])('AttractapService RFID card notifications (%s)', (locale) => {
  let service: AttractapService;
  let nfcCardRepository: {
    findOne: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let notifications: { dispatch: jest.Mock };

  const user = { id: 12, username: 'jane', locale } as User;
  const card = { id: 7, uid: '04AABBCC', key: 'secret', keyNo: 1, user, isActive: true } as NFCCard;

  beforeEach(() => {
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };
    nfcCardRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      manager: {
        transaction: jest.fn(),
      },
    };

    service = new AttractapService(
      nfcCardRepository as unknown as Repository<NFCCard>,
      {} as Repository<Attractap>,
      {} as Repository<AttractapCrashReport>,
      { emit: jest.fn() } as never,
      {} as Repository<Resource>,
      {} as Repository<User>,
      {
        encrypt: jest.fn((value: string) => `encrypted:${value}`),
        decryptIfEncrypted: jest.fn((value: string) => value),
      } as unknown as EncryptionService,
      {} as MetricsService,
      {} as CoredumpSymbolicationService,
      {} as AttractapFirmwareService,
      notifications as unknown as NotificationDispatchService,
      {} as never,
    );
  });

  it('notifies the card owner when an RFID card is registered', async () => {
    nfcCardRepository.manager.transaction.mockImplementation(async (callback) => {
      return callback({
        update: jest.fn().mockResolvedValue(undefined),
        save: jest.fn().mockResolvedValue(card),
      });
    });

    await service.createNFCCard(user, { uid: card.uid, key: card.key, keyNo: card.keyNo });

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.NFC_CARDS,
        recipients: [user],
        title: expect.any(Function),
        body: expect.any(Function),
        url: '/attractap/nfc-cards',
        dedupeKey: 'nfc-card-7-registered',
      }),
    );
    const request = notifications.dispatch.mock.calls[0][0];
    expect(request.title(user)).toBe(locale?.startsWith('de') ? 'RFID-Karte registriert' : 'RFID card registered');
    expect(request.body(user)).toBe(
      locale?.startsWith('de')
        ? 'RFID-Karte #7 wurde für dein Konto registriert.'
        : 'RFID card #7 was registered for your account.',
    );
  });

  it('notifies the card owner when an RFID card is activated', async () => {
    nfcCardRepository.manager.transaction.mockImplementation(async (callback) => {
      return callback({
        findOne: jest.fn().mockResolvedValue(card),
        createQueryBuilder: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue(undefined),
        }),
        save: jest.fn().mockResolvedValue(card),
      });
    });

    await service.activateNFCCard(card.id);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.NFC_CARDS,
        recipients: [user],
        title: expect.any(Function),
        body: expect.any(Function),
        url: '/attractap/nfc-cards',
        dedupeKey: 'nfc-card-7-activated',
      }),
    );
    const request = notifications.dispatch.mock.calls[0][0];
    expect(request.title(user)).toBe(locale?.startsWith('de') ? 'RFID-Karte aktiviert' : 'RFID card activated');
    expect(request.body(user)).toBe(
      locale?.startsWith('de') ? 'RFID-Karte #7 wurde aktiviert.' : 'RFID card #7 was activated.',
    );
  });

  it('notifies the card owner when an RFID card is deactivated', async () => {
    nfcCardRepository.update.mockResolvedValue({ affected: 1 } as never);
    nfcCardRepository.findOne.mockResolvedValue(card as never);

    await service.deactivateNFCCard(card.id);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.NFC_CARDS,
        recipients: [user],
        title: expect.any(Function),
        body: expect.any(Function),
        url: '/attractap/nfc-cards',
        dedupeKey: 'nfc-card-7-deactivated',
      }),
    );
    const request = notifications.dispatch.mock.calls[0][0];
    expect(request.title(user)).toBe(locale?.startsWith('de') ? 'RFID-Karte deaktiviert' : 'RFID card deactivated');
    expect(request.body(user)).toBe(
      locale?.startsWith('de') ? 'RFID-Karte #7 wurde deaktiviert.' : 'RFID card #7 was deactivated.',
    );
  });

  it('notifies the card owner when an RFID card is deleted', async () => {
    nfcCardRepository.findOne.mockResolvedValue(card as never);
    nfcCardRepository.delete.mockResolvedValue({ affected: 1 } as DeleteResult);

    await service.deleteNFCCard(card.id);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.NFC_CARDS,
        recipients: [user],
        title: expect.any(Function),
        body: expect.any(Function),
        url: '/attractap/nfc-cards',
        dedupeKey: 'nfc-card-7-deleted',
      }),
    );
    const request = notifications.dispatch.mock.calls[0][0];
    expect(request.title(user)).toBe(locale?.startsWith('de') ? 'RFID-Karte gelöscht' : 'RFID card deleted');
    expect(request.body(user)).toBe(
      locale?.startsWith('de')
        ? 'RFID-Karte #7 wurde aus deinem Konto gelöscht.'
        : 'RFID card #7 was deleted from your account.',
    );
  });
});

describe('AttractapService reader maintenance and crash reports', () => {
  const setup = () => {
    const reader = {
      id: 4,
      name: 'Reader',
      firmware: { name: 'Reader', variant: 'standard', version: '1.0', capabilities: { resourceSelection: false } },
      resources: [],
    };
    const readers = { findOne: jest.fn().mockResolvedValue(reader), save: jest.fn(async (value) => value) };
    const reports = {
      save: jest.fn(async (value) => ({ id: 7, ...value })),
      update: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    const events = { emit: jest.fn() };
    const resources = { find: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]) };
    const symbolication = {
      symbolicate: jest.fn().mockResolvedValue({ buildId: 'build', status: 'completed', backtrace: 'task: main' }),
    };
    const firmware = { getFirmwareDefinition: jest.fn().mockReturnValue({ version: '2.0' }) };
    const service = new AttractapService(
      {} as never,
      readers as never,
      reports as never,
      events as never,
      resources as never,
      {} as never,
      {} as never,
      {} as never,
      symbolication as never,
      firmware as never,
      {} as never,
      {} as never,
    );
    return { service, readers, reader, reports, events, resources, symbolication, firmware };
  };
  it('updates reader settings, limits resources for unsupported firmware, and emits the saved reader', async () => {
    const { service, readers, events } = setup();
    const result = await service.updateReader(4, { name: 'Renamed', ledBrightness: 0, connectedResourceIds: [1, 2] });
    expect(result).toMatchObject({ name: 'Renamed', ledBrightness: 0, resources: [{ id: 1 }] });
    expect(readers.save).toHaveBeenCalledWith(result);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });
  it('persists the plugin BLE opt-in only when it is given', async () => {
    const { service, readers, reader } = setup();
    await service.updateReader(4, { name: 'Kept' }, false);
    expect(readers.save).toHaveBeenLastCalledWith(expect.not.objectContaining({ allowPluginBle: true }));
    const enabled = await service.updateReader(4, { allowPluginBle: true }, false);
    expect(enabled.allowPluginBle).toBe(true);
    expect(readers.save).toHaveBeenLastCalledWith(expect.objectContaining({ allowPluginBle: true }));
    const disabled = await service.updateReader(4, { allowPluginBle: false }, false);
    expect(disabled.allowPluginBle).toBe(false);
    expect((reader as { allowPluginBle?: boolean }).allowPluginBle).toBe(false);
  });
  it('keeps the plugin BLE opt-in when other reader fields change', async () => {
    const { service, readers, reader: fixture, events } = setup();
    const reader = Object.assign(fixture, { allowPluginBle: true });
    const renamed = await service.updateReader(4, { name: 'Renamed' });
    expect(renamed.allowPluginBle).toBe(true);
    expect(readers.save).toHaveBeenLastCalledWith(expect.objectContaining({ allowPluginBle: true }));
    expect(events.emit).toHaveBeenLastCalledWith(
      ReaderUpdatedEvent.EVENT_NAME,
      expect.objectContaining({ reader: expect.objectContaining({ allowPluginBle: true }) }),
    );
    await service.updateReader(4, { ledBrightness: 5, connectedResourceIds: [1] });
    expect(readers.save).toHaveBeenLastCalledWith(expect.objectContaining({ allowPluginBle: true }));
    const firmware = {
      name: 'Reader',
      variant: 'standard',
      version: '2.0',
      capabilities: { resourceSelection: false },
    };
    await service.updateReaderFirmware(4, firmware as never);
    expect(readers.save).toHaveBeenLastCalledWith(expect.objectContaining({ allowPluginBle: true, firmware }));
    expect(reader.allowPluginBle).toBe(true);
  });
  it('allows resource selection when supported and can clear attachments without emitting an event', async () => {
    const { service, reader, events } = setup();
    reader.firmware.capabilities.resourceSelection = true;
    expect((await service.updateReader(4, { connectedResourceIds: [1, 2] }, false)).resources).toHaveLength(2);
    expect((await service.updateReader(4, { connectedResourceIds: [] }, false)).resources).toEqual([]);
    expect(events.emit).not.toHaveBeenCalled();
  });
  it('normalizes crash report metrics and avoids symbolication when no dump is provided', async () => {
    const { service, reports, symbolication } = setup();
    const report = await service.createCrashReport(4, {
      resetReason: 'panic',
      heapFreeBytes: 123.9,
      largestFreeBlockBytes: NaN,
      uptimeBeforeResetMs: Infinity,
    } as never);
    expect(report).toMatchObject({
      heapFreeBytes: 123,
      largestFreeBlockBytes: null,
      uptimeBeforeResetMs: null,
      coredump: null,
      coredumpSize: null,
      symbolicationStatus: null,
    });
    expect(reports.save).toHaveBeenCalledWith(
      expect.objectContaining({ attractapId: 4, rebootReason: null, wsState: null }),
    );
    expect(symbolication.symbolicate).not.toHaveBeenCalled();
  });
  it('symbolicates the binary dump but omits its bytes from the response', async () => {
    const { service, symbolication, reports } = setup();
    const report = await service.createCrashReport(4, {
      resetReason: 'panic',
      coredumpBase64: Buffer.from('dump').toString('base64'),
      rebootReason: 'watchdog',
      firmwareVersion: '1.0',
      wsState: 'connected',
      wifiState: 'online',
    } as never);
    expect(symbolication.symbolicate).toHaveBeenCalledWith(Buffer.from('dump'), { variant: 'standard' });
    expect(report).toMatchObject({
      coredump: null,
      coredumpSize: 4,
      symbolicationStatus: 'completed',
      symbolizedBacktrace: 'task: main',
    });
    expect(reports.update).toHaveBeenCalledWith(7, expect.objectContaining({ coredumpBuildId: 'build' }));
  });
  it('marks a report as awaiting the announced chunked coredump', async () => {
    const { service, reports, symbolication } = setup();
    const report = await service.createCrashReport(4, { resetReason: 'PANIC', coredumpSize: 43776 } as never, {
      size: 43776,
      crc32: 0xdeadbeef,
    });
    expect(report).toMatchObject({
      coredumpStatus: 'awaiting',
      coredumpExpectedSize: 43776,
      coredumpExpectedCrc32: 0xdeadbeef,
      coredumpSize: null,
      symbolicationStatus: null,
    });
    expect(reports.save).toHaveBeenCalledWith(expect.objectContaining({ coredump: null }));
    expect(symbolication.symbolicate).not.toHaveBeenCalled();
  });
  it('records a refused coredump as rejected with its announced size', async () => {
    const { service, symbolication } = setup();
    const report = await service.createCrashReport(4, { resetReason: 'PANIC', coredumpSize: 140000 } as never, null, {
      size: 140000,
    });
    expect(report).toMatchObject({
      coredumpStatus: 'rejected',
      coredumpExpectedSize: 140000,
      coredumpExpectedCrc32: null,
      coredumpSize: null,
    });
    expect(symbolication.symbolicate).not.toHaveBeenCalled();
  });
  it('keeps an inline coredump stored even when a size is announced as well', async () => {
    const { service } = setup();
    const report = await service.createCrashReport(
      4,
      { resetReason: 'PANIC', coredumpBase64: Buffer.from('dump').toString('base64') } as never,
      { size: 4, crc32: 1 },
    );
    expect(report).toMatchObject({ coredumpStatus: 'stored', coredumpSize: 4, coredumpExpectedSize: null });
  });
  it('stores a verified chunked coredump only on a report that awaits one, then symbolicates it', async () => {
    const { service, reports, symbolication } = setup();
    const dump = Buffer.alloc(43776, 7);
    reports.update.mockResolvedValueOnce({ affected: 1 });
    const report = { id: 7, attractapId: 4, coredumpStatus: 'awaiting' } as never;
    expect(await service.storeUploadedCoredump(report, dump)).toBe(true);
    expect(reports.update).toHaveBeenNthCalledWith(
      1,
      { id: 7, attractapId: 4, coredumpStatus: 'awaiting' },
      { coredump: dump, coredumpSize: 43776, coredumpStatus: 'stored', symbolicationStatus: 'pending' },
    );
    expect(symbolication.symbolicate).toHaveBeenCalledWith(dump, { variant: 'standard' });
    expect(report).toMatchObject({ coredumpStatus: 'stored', coredumpSize: 43776, symbolicationStatus: 'completed' });

    reports.update.mockResolvedValueOnce({ affected: 0 });
    symbolication.symbolicate.mockClear();
    expect(await service.storeUploadedCoredump({ id: 8, attractapId: 4 } as never, dump)).toBe(false);
    expect(symbolication.symbolicate).not.toHaveBeenCalled();
  });
  it('finds a crash report only for the reader that owns it', async () => {
    const { service, reports } = setup();
    Object.assign(reports, { findOne: jest.fn().mockResolvedValue(null) });
    expect(await service.findCrashReportOfReader(7, 5)).toBeNull();
    expect((reports as unknown as { findOne: jest.Mock }).findOne).toHaveBeenCalledWith({
      where: { id: 7, attractapId: 5 },
    });
  });
  it('finds the newest report of the reader that still awaits exactly the announced dump', async () => {
    const { service, reports } = setup();
    const findOne = jest.fn().mockResolvedValue({ id: 7 });
    Object.assign(reports, { findOne });
    expect(await service.findAwaitingCrashReport(4, { size: 43776, crc32: 0xdeadbeef })).toEqual({ id: 7 });
    expect(findOne).toHaveBeenCalledWith({
      where: {
        attractapId: 4,
        coredumpStatus: 'awaiting',
        coredumpExpectedSize: 43776,
        coredumpExpectedCrc32: 0xdeadbeef,
      },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  });
  it(`symbolicates at most ${SYMBOLICATION_CONCURRENCY} coredumps at once, inline and uploaded alike`, async () => {
    const { service, reports, symbolication } = setup();
    reports.update.mockResolvedValue({ affected: 1 });
    const running: Array<() => void> = [];
    symbolication.symbolicate.mockImplementation(
      () =>
        new Promise((resolve) => running.push(() => resolve({ buildId: 'build', status: 'success', backtrace: 'bt' }))),
    );
    const settle = () => new Promise(setImmediate);
    const dump = Buffer.from('dump');

    const done = [
      service.createCrashReport(4, { resetReason: 'PANIC', coredumpBase64: dump.toString('base64') } as never),
      service.storeUploadedCoredump({ id: 8, attractapId: 4 } as never, dump),
      service.storeUploadedCoredump({ id: 9, attractapId: 4 } as never, dump),
    ];
    await settle();
    expect(symbolication.symbolicate).toHaveBeenCalledTimes(2);

    running.shift()?.();
    await settle();
    expect(symbolication.symbolicate).toHaveBeenCalledTimes(3);
    running.splice(0).forEach((finish) => finish());
    await Promise.all(done);
    expect(reports.update).toHaveBeenCalledWith(9, expect.objectContaining({ symbolicationStatus: 'success' }));
  });
  it('frees the symbolication slot when symbolication fails', async () => {
    const { service, reports, symbolication } = setup();
    reports.update.mockResolvedValue({ affected: 1 });
    symbolication.symbolicate.mockRejectedValue(new Error('gdb crashed'));
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    for (const id of [1, 2, 3]) {
      await service.storeUploadedCoredump({ id, attractapId: 4 } as never, Buffer.from('dump'));
    }
    expect(symbolication.symbolicate).toHaveBeenCalledTimes(3);
  });
  it('looks up installed and server firmware while listing crash reports', async () => {
    const { service, firmware, readers } = setup();
    expect(await service.getCrashReportsForReader(4)).toEqual([]);
    expect(firmware.getFirmwareDefinition).toHaveBeenCalledWith('Reader', 'standard');
    readers.findOne.mockResolvedValue(null);
    firmware.getFirmwareDefinition.mockClear();
    expect(await service.getCrashReportsForReader(99)).toEqual([]);
    expect(firmware.getFirmwareDefinition).not.toHaveBeenCalled();
  });
});
