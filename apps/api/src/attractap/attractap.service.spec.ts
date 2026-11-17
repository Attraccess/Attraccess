import type { AttractapNfcCard } from '@attraccess/application-models';
import { AttractapService } from './attractap.service';
import { EncryptionService } from '../encryption/encryption.service';
import { MetricsService } from '../metrics/metrics.service';
import { CoredumpSymbolicationService } from './coredump-symbolication.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { NotificationCategory } from '../notifications/notification-types';
import { AttractapFirmwareService } from './firmware.service';
import {
  FakeCardStore,
  FakeCrashReportStore,
  FakeReaderStore,
  makeReader,
  makeResource,
} from './attractap-fake-stores.test-fixture';

describe.each(['en', 'de', 'de-DE', undefined, 'fr'])('AttractapService RFID card notifications (%s)', (locale) => {
  let service: AttractapService;
  let cards: FakeCardStore;
  let notifications: { dispatch: jest.Mock };

  const user = { id: 12, username: 'jane', locale } as AttractapNfcCard['user'];
  const seedCard = (): AttractapNfcCard => ({
    id: 7,
    uid: '04AABBCC',
    key: 'secret',
    keyNo: 1,
    user,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    lastSeen: new Date(0),
  });

  beforeEach(() => {
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };
    cards = new FakeCardStore();
    cards.cards.push(seedCard());
    // The fake store has no user rows: it hands the seeded owner back, as the real store reads it.
    jest.spyOn(cards, 'create').mockImplementation(async () => seedCard());

    service = new AttractapService(
      cards,
      new FakeReaderStore(),
      new FakeCrashReportStore(),
      { emit: jest.fn() } as never,
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
    await service.createNFCCard(user, { uid: '04AABBCC', key: 'secret', keyNo: 1 });

    expect(cards.create).toHaveBeenCalledWith(12, { uid: '04AABBCC', key: 'encrypted:secret', keyNo: 1 }, true);
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
    await service.activateNFCCard(7);

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
    await service.deactivateNFCCard(7);

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
    await service.deleteNFCCard(7);

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
    const readers = new FakeReaderStore();
    const reader = readers.add(
      makeReader({ id: 4, firmware: { ...makeReader().firmware, name: 'Reader', variant: 'standard' } }),
    );
    reader.firmware.capabilities.resourceSelection = false;
    reader.resources = [];
    readers.resources.set(1, makeResource(1));
    readers.resources.set(2, makeResource(2));
    const reports = new FakeCrashReportStore();
    const events = { emit: jest.fn() };
    const symbolication = {
      symbolicate: jest.fn().mockResolvedValue({ buildId: 'build', status: 'completed', backtrace: 'task: main' }),
    };
    const firmware = { getFirmwareDefinition: jest.fn().mockReturnValue({ version: '2.0' }) };
    const service = new AttractapService(
      new FakeCardStore(),
      readers,
      reports,
      events as never,
      {} as never,
      {} as never,
      symbolication as never,
      firmware as never,
      {} as never,
      {} as never,
    );
    return { service, readers, reader, reports, events, symbolication, firmware };
  };
  it('updates reader settings, limits resources for unsupported firmware, and emits the saved reader', async () => {
    const { service, readers, events } = setup();
    const result = await service.updateReader(4, { name: 'Renamed', ledBrightness: 0, connectedResourceIds: [1, 2] });
    expect(result).toMatchObject({ name: 'Renamed', ledBrightness: 0, resources: [{ id: 1 }] });
    // Only editable fields reach the store, never credential columns.
    expect(readers.edits).toEqual([{ id: 4, edit: { name: 'Renamed', ledBrightness: 0, resourceIds: [1] } }]);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });
  it('allows resource selection when supported and can clear attachments without emitting an event', async () => {
    const { service, reader, events } = setup();
    reader.firmware.capabilities.resourceSelection = true;
    expect((await service.updateReader(4, { connectedResourceIds: [1, 2] }, false)).resources).toHaveLength(2);
    expect((await service.updateReader(4, { connectedResourceIds: [] }, false)).resources).toEqual([]);
    expect(events.emit).not.toHaveBeenCalled();
  });
  it('uses the firmware of the same update to decide how many resources a reader may link', async () => {
    const { service, reader } = setup();
    reader.firmware.capabilities.resourceSelection = false;
    const firmware = { ...reader.firmware, capabilities: { ...reader.firmware.capabilities, resourceSelection: true } };
    expect((await service.updateReader(4, { firmware, connectedResourceIds: [1, 2] }, false)).resources).toHaveLength(
      2,
    );
  });
  it('fails for a reader that does not exist', async () => {
    const { service } = setup();
    await expect(service.updateReader(99, { name: 'x' })).rejects.toThrow('Reader with ID 99 not found');
  });
  it('deletes a reader and announces it only when one was deleted', async () => {
    const { service, events } = setup();
    expect(await service.deleteReader(99)).toBe(false);
    expect(events.emit).not.toHaveBeenCalled();
    expect(await service.deleteReader(4)).toBe(true);
    expect(events.emit).toHaveBeenCalledWith('reader.deleted', expect.objectContaining({ readerId: 4 }));
  });
  it('lists paired readers only, keeping resources out unless asked for', async () => {
    const { service, readers } = setup();
    readers.add(makeReader({ id: 5, pairingState: 'unpaired' }));
    expect((await service.getPairedReaders()).map((r) => r.id)).toEqual([4]);
    expect((await service.getReadersToPair()).map((r) => r.id)).toEqual([5]);
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
    expect(reports.reports[0]).toMatchObject({ attractapId: 4, rebootReason: null, wsState: null });
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
    expect(reports.symbolications).toEqual([
      { id: 7, result: expect.objectContaining({ coredumpBuildId: 'build', symbolicationStatus: 'completed' }) },
    ]);
  });
  it('records a failed symbolication on the report', async () => {
    const { service, symbolication, reports } = setup();
    symbolication.symbolicate.mockRejectedValue(new Error('no elf'));
    const report = await service.createCrashReport(4, {
      resetReason: 'panic',
      coredumpBase64: Buffer.from('dump').toString('base64'),
    } as never);
    expect(report).toMatchObject({ symbolicationStatus: 'failed', symbolizedBacktrace: 'no elf' });
    expect(reports.symbolications).toEqual([
      { id: 7, result: { symbolicationStatus: 'failed', symbolizedBacktrace: 'no elf' } },
    ]);
  });
  it('looks up installed and server firmware while listing crash reports', async () => {
    const { service, firmware, readers } = setup();
    expect(await service.getCrashReportsForReader(4)).toEqual([]);
    expect(firmware.getFirmwareDefinition).toHaveBeenCalledWith('Reader', 'standard');
    readers.readers.delete(4);
    firmware.getFirmwareDefinition.mockClear();
    expect(await service.getCrashReportsForReader(99)).toEqual([]);
    expect(firmware.getFirmwareDefinition).not.toHaveBeenCalled();
  });
  it('serves a coredump only when one is stored', async () => {
    const { service, reports } = setup();
    expect(await service.getCrashReportCoredump(4, 7)).toBeNull();
    await service.createCrashReport(4, {
      resetReason: 'panic',
      coredumpBase64: Buffer.from('dump').toString('base64'),
    } as never);
    reports.reports[0].coredump = Buffer.from('dump');
    expect(await service.getCrashReportCoredump(4, 7)).toEqual({
      filename: 'reader-4-crash-7.coredump',
      coredump: Buffer.from('dump'),
    });
  });
});
