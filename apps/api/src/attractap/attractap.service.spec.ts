import { DeleteResult, Repository } from 'typeorm';
import { Attractap, AttractapCrashReport, NFCCard, Resource, User } from '@attraccess/database-entities';
import { AttractapService } from './attractap.service';
import { EncryptionService } from '../encryption/encryption.service';
import { MetricsService } from '../metrics/metrics.service';
import { CoredumpSymbolicationService } from './coredump-symbolication.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { NotificationCategory } from '../notifications/notification-types';
import { AttractapFirmwareService } from './firmware.service';

describe('AttractapService', () => {
  let service: AttractapService;
  let nfcCardRepository: {
    findOne: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let notifications: { dispatch: jest.Mock };

  const user = { id: 12, username: 'jane' } as User;
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

  it('notifies the card owner when an NFC card is registered', async () => {
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
        title: 'NFC card registered',
        body: 'NFC card #7 was registered for your account.',
        url: '/attractap/nfc-cards',
        dedupeKey: 'nfc-card-7-registered',
      }),
    );
  });

  it('notifies the card owner when an NFC card is activated', async () => {
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
        title: 'NFC card activated',
        body: 'NFC card #7 was activated.',
        url: '/attractap/nfc-cards',
        dedupeKey: 'nfc-card-7-activated',
      }),
    );
  });

  it('notifies the card owner when an NFC card is deactivated', async () => {
    nfcCardRepository.update.mockResolvedValue({ affected: 1 } as never);
    nfcCardRepository.findOne.mockResolvedValue(card as never);

    await service.deactivateNFCCard(card.id);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.NFC_CARDS,
        recipients: [user],
        title: 'NFC card deactivated',
        body: 'NFC card #7 was deactivated.',
        url: '/attractap/nfc-cards',
        dedupeKey: 'nfc-card-7-deactivated',
      }),
    );
  });

  it('notifies the card owner when an NFC card is deleted', async () => {
    nfcCardRepository.findOne.mockResolvedValue(card as never);
    nfcCardRepository.delete.mockResolvedValue({ affected: 1 } as DeleteResult);

    await service.deleteNFCCard(card.id);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.NFC_CARDS,
        recipients: [user],
        title: 'NFC card deleted',
        body: 'NFC card #7 was deleted from your account.',
        url: '/attractap/nfc-cards',
        dedupeKey: 'nfc-card-7-deleted',
      }),
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
