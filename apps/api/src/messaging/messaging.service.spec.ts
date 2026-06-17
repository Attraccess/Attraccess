import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  Conversation,
  ConversationParticipant,
  Message,
  MessageReferenceType,
  Resource,
  User,
} from '@attraccess/database-entities';
import { MessagingService } from './messaging.service';
import { MessagingLiveService } from './messaging-live.service';
import { MessageCreatedEvent } from './events/message-created.event';
import { ResourceUsageService } from '../resources/usage/resourceUsage.service';
import { MessageRateLimitService } from './rate-limiting/message-rate-limit.service';
import { MessageRateLimitExceededException } from './rate-limiting/message-rate-limit.exception';

describe('MessagingService', () => {
  let service: MessagingService;
  let conversationRepository: { findOne: jest.Mock; update: jest.Mock };
  let participantRepository: { findOne: jest.Mock; find: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock };
  let messageRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    findAndCount: jest.Mock;
    count: jest.Mock;
  };
  let userRepository: { findOne: jest.Mock };
  let resourceRepository: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let resourceUsageService: { getActiveSession: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let messagingLiveService: { isOnline: jest.Mock };
  let messageRateLimitService: { assertWithinLimit: jest.Mock };

  const pairQuery = {
    select: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    andHaving: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(undefined),
    getOne: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    conversationRepository = { findOne: jest.fn(), update: jest.fn() };
    participantRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(pairQuery),
    };
    messageRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      findAndCount: jest.fn(),
      count: jest.fn(),
    };
    userRepository = { findOne: jest.fn() };
    resourceRepository = { findOne: jest.fn() };
    dataSource = { transaction: jest.fn() };
    resourceUsageService = { getActiveSession: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    messagingLiveService = { isOnline: jest.fn().mockReturnValue(false) };
    messageRateLimitService = { assertWithinLimit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: getRepositoryToken(Conversation), useValue: conversationRepository },
        { provide: getRepositoryToken(ConversationParticipant), useValue: participantRepository },
        { provide: getRepositoryToken(Message), useValue: messageRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(Resource), useValue: resourceRepository },
        { provide: DataSource, useValue: dataSource },
        { provide: ResourceUsageService, useValue: resourceUsageService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: MessagingLiveService, useValue: messagingLiveService },
        { provide: MessageRateLimitService, useValue: messageRateLimitService },
      ],
    }).compile();

    service = module.get(MessagingService);
    pairQuery.getRawOne.mockResolvedValue(undefined);
  });

  describe('getOrCreateConversation', () => {
    it('rejects self conversations', async () => {
      await expect(service.getOrCreateConversation(1, 1)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when the target user does not exist', async () => {
      userRepository.findOne.mockResolvedValue(null);
      await expect(service.getOrCreateConversation(1, 2)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns an existing 1:1 conversation when the participant pair matches', async () => {
      userRepository.findOne.mockResolvedValue({ id: 2 } as User);
      pairQuery.getRawOne.mockResolvedValue({ conversationId: 7 });
      conversationRepository.findOne.mockResolvedValue({ id: 7 } as Conversation);

      const result = await service.getOrCreateConversation(1, 2);

      expect(result.id).toBe(7);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('creates a conversation with two participant rows when none exists', async () => {
      userRepository.findOne.mockResolvedValue({ id: 2 } as User);
      pairQuery.getRawOne.mockResolvedValue(undefined);
      const manager = {
        create: jest.fn().mockImplementation((_entity, data) => data),
        save: jest.fn().mockImplementation(async (data) => (Array.isArray(data) ? data : { id: 9, ...data })),
      };
      dataSource.transaction.mockImplementation(async (cb) => cb(manager));

      const result = await service.getOrCreateConversation(1, 2);

      expect(result.id).toBe(9);
      expect(manager.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendMessage', () => {
    it('throws when the sender is not a participant', async () => {
      participantRepository.findOne.mockResolvedValue(null);
      await expect(service.sendMessage(1, 5, 'hi')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('persists the message and emits MessageCreatedEvent', async () => {
      participantRepository.findOne.mockResolvedValue({ id: 1 } as ConversationParticipant);
      messageRepository.create.mockImplementation((data) => data);
      messageRepository.save.mockImplementation(async (data) => ({ id: 3, ...data }));

      const result = await service.sendMessage(1, 5, 'hello', {
        referenceType: MessageReferenceType.RESOURCE,
        referenceId: 42,
      });

      expect(result.referenceType).toBe(MessageReferenceType.RESOURCE);
      expect(result.referenceId).toBe(42);
      expect(eventEmitter.emit).toHaveBeenCalledWith(MessageCreatedEvent.EVENT_NAME, expect.any(MessageCreatedEvent));
    });
  });

  describe('rate limiting', () => {
    it('checks the send_message limit before sending', async () => {
      participantRepository.findOne.mockResolvedValue({ id: 1 } as ConversationParticipant);
      messageRepository.save.mockImplementation(async (data) => ({ id: 3, ...data }));

      await service.sendMessage(1, 5, 'hello');

      expect(messageRateLimitService.assertWithinLimit).toHaveBeenCalledWith('send_message', 5);
    });

    it('propagates the 429 and skips the send when the send limit is exceeded', async () => {
      const error = new MessageRateLimitExceededException(30);
      messageRateLimitService.assertWithinLimit.mockImplementation(() => {
        throw error;
      });

      await expect(service.sendMessage(1, 5, 'hello')).rejects.toBe(error);
      expect(participantRepository.findOne).not.toHaveBeenCalled();
      expect(messageRepository.save).not.toHaveBeenCalled();
    });

    it('checks the contact limit when opening a conversation', async () => {
      messageRateLimitService.assertWithinLimit.mockImplementation(() => {
        throw new MessageRateLimitExceededException(60);
      });

      await expect(service.getOrCreateConversation(1, 2)).rejects.toBeInstanceOf(MessageRateLimitExceededException);
      expect(messageRateLimitService.assertWithinLimit).toHaveBeenCalledWith('contact', 1);
      expect(userRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('listMessages', () => {
    it('throws for non-participants', async () => {
      participantRepository.findOne.mockResolvedValue(null);
      await expect(service.listMessages(1, 5)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns paginated messages for a participant', async () => {
      participantRepository.findOne.mockResolvedValue({ id: 1 } as ConversationParticipant);
      messageRepository.findAndCount.mockResolvedValue([[{ id: 1 } as Message], 1]);

      const result = await service.listMessages(1, 5, 2, 10);

      expect(result).toEqual({ data: [{ id: 1 }], total: 1, page: 2, limit: 10 });
    });
  });

  describe('resolveResourceHolder', () => {
    it('returns the active session user', async () => {
      resourceUsageService.getActiveSession.mockResolvedValue({ user: { id: 8 } });
      await expect(service.resolveResourceHolder(3)).resolves.toEqual({ id: 8 });
    });

    it('returns null when there is no active session', async () => {
      resourceUsageService.getActiveSession.mockResolvedValue(null);
      await expect(service.resolveResourceHolder(3)).resolves.toBeNull();
    });
  });

  describe('listConversations', () => {
    it('includes the unread count per conversation', async () => {
      participantRepository.find.mockResolvedValue([
        { conversationId: 1, lastReadAt: null, conversation: { updatedAt: new Date(1000) } },
      ]);
      messageRepository.findOne.mockResolvedValue({ id: 5, createdAt: new Date(2000) } as Message);
      pairQuery.getOne = jest.fn().mockResolvedValue({ user: { id: 2 } });
      messageRepository.count.mockResolvedValue(4);

      const result = await service.listConversations(7);

      expect(result[0].unreadCount).toBe(4);
    });

    it('reflects the other participant online state from MessagingLiveService', async () => {
      participantRepository.find.mockResolvedValue([
        { conversationId: 1, lastReadAt: null, conversation: { updatedAt: new Date(1000) } },
      ]);
      messageRepository.findOne.mockResolvedValue({ id: 5, createdAt: new Date(2000) } as Message);
      pairQuery.getOne = jest.fn().mockResolvedValue({ user: { id: 2 } });
      messageRepository.count.mockResolvedValue(0);
      messagingLiveService.isOnline.mockReturnValue(true);

      const result = await service.listConversations(7);

      expect(result[0].otherParticipantOnline).toBe(true);
      expect(messagingLiveService.isOnline).toHaveBeenCalledWith(2);
    });
  });

  describe('markConversationRead', () => {
    it('throws for non-participants', async () => {
      participantRepository.findOne.mockResolvedValue(null);
      await expect(service.markConversationRead(1, 5)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('updates lastReadAt and returns the new total unread count', async () => {
      participantRepository.findOne.mockResolvedValue({ id: 1 } as ConversationParticipant);
      participantRepository.find.mockResolvedValue([{ conversationId: 1, lastReadAt: new Date() }]);
      messageRepository.count.mockResolvedValue(0);

      const total = await service.markConversationRead(1, 5);

      expect(participantRepository.update).toHaveBeenCalledWith(
        { conversationId: 1, userId: 5 },
        expect.objectContaining({ lastReadAt: expect.any(Date) }),
      );
      expect(total).toBe(0);
    });
  });

  describe('getTotalUnreadCount', () => {
    it('sums unread counts across all participations', async () => {
      participantRepository.find.mockResolvedValue([
        { conversationId: 1, lastReadAt: null },
        { conversationId: 2, lastReadAt: new Date() },
      ]);
      messageRepository.count.mockResolvedValueOnce(2).mockResolvedValueOnce(3);

      await expect(service.getTotalUnreadCount(5)).resolves.toBe(5);
    });
  });
});
