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
