import { attractapOperationsFake } from './persistence/operations.test-fixture';
import { AttractapPersistence } from './persistence/port';

import { AttractapCrashReport, NFCCard, Resource, User } from '@attraccess/application-models';
import { AttractapService } from './attractap.service';
import { EncryptionService } from '../encryption/encryption.service';
import { MetricsService } from '../metrics/metrics.service';
import { CoredumpSymbolicationService } from './coredump-symbolication.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { NotificationCategory } from '../notifications/notification-types';
import { AttractapFirmwareService } from './firmware.service';

describe.each(['en', 'de', 'de-DE', undefined, 'fr'])('AttractapService RFID card notifications (%s)', (locale) => {
  let service: AttractapService;
  let persistence: jest.Mocked<AttractapPersistence>;
  let notifications: { dispatch: jest.Mock };

  const user = { id: 12, username: 'jane', locale } as User;
  const card = { id: 7, uid: '04AABBCC', key: 'secret', keyNo: 1, user, isActive: true } as NFCCard;

  beforeEach(() => {
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };
    persistence = attractapOperationsFake();
    service = new AttractapService(
      persistence,
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
    persistence.registerActiveCard.mockResolvedValue(card);

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
    persistence.activateCard.mockResolvedValue(card);

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
    persistence.cardById.mockResolvedValue(card as never);

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
    persistence.cardById.mockResolvedValue(card as never);
    persistence.removeCard.mockResolvedValue(true);

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
    const persistence = attractapOperationsFake();
    const readerLookup = jest.fn().mockResolvedValue(reader);
    persistence.readerWithResources = readerLookup;
    persistence.readerFirmware = readerLookup;
    persistence.saveReader.mockImplementation(async (value) => value);
    persistence.recordCrash.mockImplementation(async (value) => ({ id: 7, ...value }) as AttractapCrashReport);
    persistence.readerCrashReports.mockResolvedValue([]);
    const events = { emit: jest.fn() };
    persistence.resourcesByIds.mockImplementation(async (ids) => ids.map((id) => ({ id }) as Resource));
    const symbolication = {
      symbolicate: jest.fn().mockResolvedValue({ buildId: 'build', status: 'completed', backtrace: 'task: main' }),
    };
    const firmware = { getFirmwareDefinition: jest.fn().mockReturnValue({ version: '2.0' }) };
    const service = new AttractapService(
      persistence,
      events as never,
      {} as never,
      {} as never,
      symbolication as never,
      firmware as never,
      {} as never,
      {} as never,
    );
    return { service, persistence, reader, events, symbolication, firmware };
  };
  it('updates reader settings, limits resources for unsupported firmware, and emits the saved reader', async () => {
    const { service, persistence, events } = setup();
    const result = await service.updateReader(4, { name: 'Renamed', ledBrightness: 0, connectedResourceIds: [1, 2] });
    expect(result).toMatchObject({ name: 'Renamed', ledBrightness: 0, resources: [{ id: 1 }] });
    expect(persistence.saveReader).toHaveBeenCalledWith(result);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });
  it('allows resource selection when supported and can clear attachments without emitting an event', async () => {
    const { service, reader, events } = setup();
    reader.firmware.capabilities.resourceSelection = true;
    expect((await service.updateReader(4, { connectedResourceIds: [1, 2] }, false)).resources).toHaveLength(2);
    expect((await service.updateReader(4, { connectedResourceIds: [] }, false)).resources).toEqual([]);
    expect(events.emit).not.toHaveBeenCalled();
  });
  it('normalizes crash report metrics and avoids symbolication when no dump is provided', async () => {
    const { service, persistence, symbolication } = setup();
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
    expect(persistence.recordCrash).toHaveBeenCalledWith(
      expect.objectContaining({ attractapId: 4, rebootReason: null, wsState: null }),
    );
    expect(symbolication.symbolicate).not.toHaveBeenCalled();
  });
  it('symbolicates the binary dump but omits its bytes from the response', async () => {
    const { service, symbolication, persistence } = setup();
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
    expect(persistence.recordSymbolication).toHaveBeenCalledWith(7, 'completed', 'task: main', 'build');
  });
  it('looks up installed and server firmware while listing crash reports', async () => {
    const { service, firmware, persistence } = setup();
    expect(await service.getCrashReportsForReader(4)).toEqual([]);
    expect(firmware.getFirmwareDefinition).toHaveBeenCalledWith('Reader', 'standard');
    persistence.readerFirmware.mockResolvedValue(null);
    firmware.getFirmwareDefinition.mockClear();
    expect(await service.getCrashReportsForReader(99)).toEqual([]);
    expect(firmware.getFirmwareDefinition).not.toHaveBeenCalled();
  });
});
