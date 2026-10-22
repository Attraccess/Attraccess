import { MessagingPersistence } from './persistence/port';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  Conversation,
  ConversationParticipant,
  Message,
  MessageReferenceType,
  User,
} from '@attraccess/application-models';
import { MessagingService } from './messaging.service';
import { MessagingLiveService } from './messaging-live.service';
import { MessageCreatedEvent } from './events/message-created.event';
import { ResourceUsageService } from '../resources/usage/sessions/resource-usage.service';
import { MessageRateLimitService } from './rate-limiting/message-rate-limit.service';
import { MessageRateLimitExceededException } from './rate-limiting/message-rate-limit.exception';

describe('MessagingService', () => {
  let service: MessagingService;
  let persistence: jest.Mocked<MessagingPersistence>;
  let resourceUsageService: { getActiveSession: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let messagingLiveService: { isOnline: jest.Mock };
  let messageRateLimitService: { assertWithinLimit: jest.Mock };

  beforeEach(async () => {
    persistence = {
      messageWithSender: jest.fn(),
      participants: jest.fn(),
      markRead: jest.fn(),
      userParticipations: jest.fn(),
      findParticipant: jest.fn(),
      findUser: jest.fn(),
      createPair: jest.fn(),
      findPair: jest.fn().mockResolvedValue(null),
      storeMessage: jest.fn(async (data) => ({ id: 3, ...data }) as Message as Message),
      touchConversation: jest.fn(),
      lastMessage: jest.fn(),
      messagePage: jest.fn(),
      countUnread: jest.fn(),
      otherParticipant: jest.fn(),
      findResource: jest.fn(),
    };
    resourceUsageService = { getActiveSession: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    messagingLiveService = { isOnline: jest.fn().mockReturnValue(false) };
    messageRateLimitService = { assertWithinLimit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: MessagingPersistence, useValue: persistence },
        { provide: ResourceUsageService, useValue: resourceUsageService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: MessagingLiveService, useValue: messagingLiveService },
        { provide: MessageRateLimitService, useValue: messageRateLimitService },
      ],
    }).compile();

    service = module.get(MessagingService);
  });

  describe('getOrCreateConversation', () => {
    it('rejects self conversations', async () => {
      await expect(service.getOrCreateConversation(1, 1)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when the target user does not exist', async () => {
      persistence.findUser.mockResolvedValue(null);
      await expect(service.getOrCreateConversation(1, 2)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns an existing 1:1 conversation when the participant pair matches', async () => {
      persistence.findUser.mockResolvedValue({ id: 2 } as User);
      persistence.findPair.mockResolvedValue({ id: 7 } as Conversation);

      const result = await service.getOrCreateConversation(1, 2);

      expect(result.id).toBe(7);
      expect(persistence.createPair).not.toHaveBeenCalled();
    });

    it('creates a conversation with two participant rows when none exists', async () => {
      persistence.findUser.mockResolvedValue({ id: 2 } as User);
      persistence.createPair.mockResolvedValue({ id: 9 } as Conversation);

      const result = await service.getOrCreateConversation(1, 2);

      expect(result.id).toBe(9);
      expect(persistence.createPair).toHaveBeenCalledWith(1, 2);
    });
  });

  describe('sendMessage', () => {
    it('throws when the sender is not a participant', async () => {
      persistence.findParticipant.mockResolvedValue(null);
      await expect(service.sendMessage(1, 5, 'hi')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('persists the message and emits MessageCreatedEvent', async () => {
      persistence.findParticipant.mockResolvedValue({ id: 1 } as ConversationParticipant);
      persistence.storeMessage.mockImplementation(async (data) => ({ id: 3, ...data }) as Message);

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
      persistence.findParticipant.mockResolvedValue({ id: 1 } as ConversationParticipant);
      persistence.storeMessage.mockImplementation(async (data) => ({ id: 3, ...data }) as Message);

      await service.sendMessage(1, 5, 'hello');

      expect(messageRateLimitService.assertWithinLimit).toHaveBeenCalledWith('send_message', 5);
    });

    it('propagates the 429 and skips the send when the send limit is exceeded', async () => {
      const error = new MessageRateLimitExceededException(30);
      messageRateLimitService.assertWithinLimit.mockImplementation(() => {
        throw error;
      });

      await expect(service.sendMessage(1, 5, 'hello')).rejects.toBe(error);
      expect(persistence.findParticipant).not.toHaveBeenCalled();
      expect(persistence.storeMessage).not.toHaveBeenCalled();
    });

    it('checks the contact limit when opening a conversation', async () => {
      messageRateLimitService.assertWithinLimit.mockImplementation(() => {
        throw new MessageRateLimitExceededException(60);
      });

      await expect(service.getOrCreateConversation(1, 2)).rejects.toBeInstanceOf(MessageRateLimitExceededException);
      expect(messageRateLimitService.assertWithinLimit).toHaveBeenCalledWith('contact', 1);
      expect(persistence.findUser).not.toHaveBeenCalled();
    });
  });

  describe('listMessages', () => {
    it('throws for non-participants', async () => {
      persistence.findParticipant.mockResolvedValue(null);
      await expect(service.listMessages(1, 5)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns paginated messages for a participant', async () => {
      persistence.findParticipant.mockResolvedValue({ id: 1 } as ConversationParticipant);
      persistence.messagePage.mockResolvedValue([[{ id: 1 } as Message], 1]);

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
      persistence.userParticipations.mockResolvedValue([
        {
          conversationId: 1,
          lastReadAt: null,
          conversation: { updatedAt: new Date(1000) },
        } as unknown as import('@attraccess/application-models').ConversationParticipant,
      ]);
      persistence.lastMessage.mockResolvedValue({ id: 5, createdAt: new Date(2000) } as Message);
      persistence.otherParticipant.mockResolvedValue({ id: 2 } as User);
      persistence.countUnread.mockResolvedValue(4);

      const result = await service.listConversations(7);

      expect(result[0].unreadCount).toBe(4);
    });

    it('reflects the other participant online state from MessagingLiveService', async () => {
      persistence.userParticipations.mockResolvedValue([
        {
          conversationId: 1,
          lastReadAt: null,
          conversation: { updatedAt: new Date(1000) },
        } as unknown as import('@attraccess/application-models').ConversationParticipant,
      ]);
      persistence.lastMessage.mockResolvedValue({ id: 5, createdAt: new Date(2000) } as Message);
      persistence.otherParticipant.mockResolvedValue({ id: 2 } as User);
      persistence.countUnread.mockResolvedValue(0);
      messagingLiveService.isOnline.mockReturnValue(true);

      const result = await service.listConversations(7);

      expect(result[0].otherParticipantOnline).toBe(true);
      expect(messagingLiveService.isOnline).toHaveBeenCalledWith(2);
    });
  });

  describe('markConversationRead', () => {
    it('throws for non-participants', async () => {
      persistence.findParticipant.mockResolvedValue(null);
      await expect(service.markConversationRead(1, 5)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('updates lastReadAt and returns the new total unread count', async () => {
      persistence.findParticipant.mockResolvedValue({ id: 1 } as ConversationParticipant);
      persistence.userParticipations.mockResolvedValue([
        {
          conversationId: 1,
          lastReadAt: new Date(),
        } as unknown as import('@attraccess/application-models').ConversationParticipant,
      ]);
      persistence.countUnread.mockResolvedValue(0);

      const total = await service.markConversationRead(1, 5);

      expect(persistence.markRead).toHaveBeenCalledWith(1, 5, expect.any(Date));
      expect(total).toBe(0);
    });
  });

  describe('getTotalUnreadCount', () => {
    it('sums unread counts across all participations', async () => {
      persistence.userParticipations.mockResolvedValue([
        {
          conversationId: 1,
          lastReadAt: null,
        } as unknown as import('@attraccess/application-models').ConversationParticipant,
        {
          conversationId: 2,
          lastReadAt: new Date(),
        } as unknown as import('@attraccess/application-models').ConversationParticipant,
      ]);
      persistence.countUnread.mockResolvedValueOnce(2).mockResolvedValueOnce(3);

      await expect(service.getTotalUnreadCount(5)).resolves.toBe(5);
    });
  });
});
