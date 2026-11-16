import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConversationRecord, MessageRecord, MessageReferenceType } from '@attraccess/application-models';
import { MessagingService } from './messaging.service';
import { MessagingLiveService } from './messaging-live.service';
import { MessageCreatedEvent } from './events/message-created.event';
import { CONVERSATION_STORE } from './conversation-store.port';
import { ResourceUsageService } from '../resources/usage/sessions/resource-usage.service';
import { MessageRateLimitService } from './rate-limiting/message-rate-limit.service';
import { MessageRateLimitExceededException } from './rate-limiting/message-rate-limit.exception';

describe('MessagingService', () => {
  let service: MessagingService;
  let store: {
    isParticipant: jest.Mock;
    markRead: jest.Mock;
    listParticipations: jest.Mock;
    countUnread: jest.Mock;
    userExists: jest.Mock;
    findOneToOneConversation: jest.Mock;
    createOneToOneConversation: jest.Mock;
    findResourceName: jest.Mock;
    appendMessage: jest.Mock;
    findLastMessage: jest.Mock;
    findOtherParticipant: jest.Mock;
    pageMessages: jest.Mock;
  };
  let resourceUsageService: { getActiveSessionsForResource: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let messagingLiveService: { isOnline: jest.Mock };
  let messageRateLimitService: { assertWithinLimit: jest.Mock };

  const participation = (overrides: Record<string, unknown> = {}) => ({
    participantId: 1,
    conversationId: 1,
    userId: 7,
    lastReadAt: null,
    lastNotifiedAt: null,
    conversationUpdatedAt: new Date(1000),
    ...overrides,
  });

  beforeEach(async () => {
    store = {
      isParticipant: jest.fn(),
      markRead: jest.fn(),
      listParticipations: jest.fn(),
      countUnread: jest.fn(),
      userExists: jest.fn(),
      findOneToOneConversation: jest.fn().mockResolvedValue(null),
      createOneToOneConversation: jest.fn(),
      findResourceName: jest.fn(),
      appendMessage: jest.fn(),
      findLastMessage: jest.fn(),
      findOtherParticipant: jest.fn(),
      pageMessages: jest.fn(),
    };
    resourceUsageService = { getActiveSessionsForResource: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    messagingLiveService = { isOnline: jest.fn().mockReturnValue(false) };
    messageRateLimitService = { assertWithinLimit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: CONVERSATION_STORE, useValue: store },
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
      store.userExists.mockResolvedValue(false);
      await expect(service.getOrCreateConversation(1, 2)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns an existing 1:1 conversation when the participant pair matches', async () => {
      store.userExists.mockResolvedValue(true);
      store.findOneToOneConversation.mockResolvedValue({ id: 7 } as ConversationRecord);

      const result = await service.getOrCreateConversation(1, 2);

      expect(result.id).toBe(7);
      expect(store.findOneToOneConversation).toHaveBeenCalledWith(1, 2);
      expect(store.createOneToOneConversation).not.toHaveBeenCalled();
    });

    it('creates the conversation with both participants when none exists', async () => {
      store.userExists.mockResolvedValue(true);
      store.createOneToOneConversation.mockResolvedValue({ id: 9 } as ConversationRecord);

      const result = await service.getOrCreateConversation(1, 2);

      expect(result.id).toBe(9);
      expect(store.createOneToOneConversation).toHaveBeenCalledWith(1, 2);
    });
  });

  describe('sendMessage', () => {
    it('throws when the sender is not a participant', async () => {
      store.isParticipant.mockResolvedValue(false);
      await expect(service.sendMessage(1, 5, 'hi')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('persists the message and emits MessageCreatedEvent', async () => {
      store.isParticipant.mockResolvedValue(true);
      store.appendMessage.mockImplementation(async (data) => ({ id: 3, ...data }));

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
      store.isParticipant.mockResolvedValue(true);
      store.appendMessage.mockImplementation(async (data) => ({ id: 3, ...data }));

      await service.sendMessage(1, 5, 'hello');

      expect(messageRateLimitService.assertWithinLimit).toHaveBeenCalledWith('send_message', 5);
    });

    it('propagates the 429 and skips the send when the send limit is exceeded', async () => {
      const error = new MessageRateLimitExceededException(30);
      messageRateLimitService.assertWithinLimit.mockImplementation(() => {
        throw error;
      });

      await expect(service.sendMessage(1, 5, 'hello')).rejects.toBe(error);
      expect(store.isParticipant).not.toHaveBeenCalled();
      expect(store.appendMessage).not.toHaveBeenCalled();
    });

    it('checks the contact limit when opening a conversation', async () => {
      messageRateLimitService.assertWithinLimit.mockImplementation(() => {
        throw new MessageRateLimitExceededException(60);
      });

      await expect(service.getOrCreateConversation(1, 2)).rejects.toBeInstanceOf(MessageRateLimitExceededException);
      expect(messageRateLimitService.assertWithinLimit).toHaveBeenCalledWith('contact', 1);
      expect(store.userExists).not.toHaveBeenCalled();
    });
  });

  describe('listMessages', () => {
    it('throws for non-participants', async () => {
      store.isParticipant.mockResolvedValue(false);
      await expect(service.listMessages(1, 5)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns paginated messages for a participant', async () => {
      store.isParticipant.mockResolvedValue(true);
      store.pageMessages.mockResolvedValue({ data: [{ id: 1 } as MessageRecord], total: 1 });

      const result = await service.listMessages(1, 5, 2, 10);

      expect(result).toEqual({ data: [{ id: 1 }], total: 1, page: 2, limit: 10 });
    });
  });

  describe('resolveResourceHolder', () => {
    it('returns the active session user', async () => {
      resourceUsageService.getActiveSessionsForResource.mockResolvedValue([{ userId: 8, user: { id: 8 } }]);
      await expect(service.resolveResourceHolder(3)).resolves.toEqual({ id: 8 });
    });

    it('returns null when there is no active session', async () => {
      resourceUsageService.getActiveSessionsForResource.mockResolvedValue([]);
      await expect(service.resolveResourceHolder(3)).resolves.toBeNull();
    });

    it('lets the sender pick one of several sessions and refuses to guess', async () => {
      resourceUsageService.getActiveSessionsForResource.mockResolvedValue([
        { userId: 8, user: { id: 8 } },
        { userId: 9, user: { id: 9 } },
      ]);
      await expect(service.resolveResourceHolder(3, 9)).resolves.toEqual({ id: 9 });
      await expect(service.resolveResourceHolder(3, 77)).resolves.toBeNull();
      await expect(service.resolveResourceHolder(3)).rejects.toThrow('choose whom to contact');
    });
  });

  describe('listConversations', () => {
    it('includes the unread count per conversation', async () => {
      store.listParticipations.mockResolvedValue([participation()]);
      store.findLastMessage.mockResolvedValue({ id: 5, createdAt: new Date(2000) } as MessageRecord);
      store.findOtherParticipant.mockResolvedValue({ id: 2 });
      store.countUnread.mockResolvedValue(4);

      const result = await service.listConversations(7);

      expect(result[0].unreadCount).toBe(4);
    });

    it('reflects the other participant online state from MessagingLiveService', async () => {
      store.listParticipations.mockResolvedValue([participation()]);
      store.findLastMessage.mockResolvedValue({ id: 5, createdAt: new Date(2000) } as MessageRecord);
      store.findOtherParticipant.mockResolvedValue({ id: 2 });
      store.countUnread.mockResolvedValue(0);
      messagingLiveService.isOnline.mockReturnValue(true);

      const result = await service.listConversations(7);

      expect(result[0].otherParticipantOnline).toBe(true);
      expect(messagingLiveService.isOnline).toHaveBeenCalledWith(2);
    });
  });

  describe('markConversationRead', () => {
    it('throws for non-participants', async () => {
      store.isParticipant.mockResolvedValue(false);
      await expect(service.markConversationRead(1, 5)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('updates lastReadAt and returns the new total unread count', async () => {
      store.isParticipant.mockResolvedValue(true);
      store.listParticipations.mockResolvedValue([participation({ lastReadAt: new Date() })]);
      store.countUnread.mockResolvedValue(0);

      const total = await service.markConversationRead(1, 5);

      expect(store.markRead).toHaveBeenCalledWith(1, 5, expect.any(Date));
      expect(total).toBe(0);
    });
  });

  describe('getTotalUnreadCount', () => {
    it('sums unread counts across all participations', async () => {
      store.listParticipations.mockResolvedValue([
        participation({ conversationId: 1 }),
        participation({ conversationId: 2, lastReadAt: new Date() }),
      ]);
      store.countUnread.mockResolvedValueOnce(2).mockResolvedValueOnce(3);

      await expect(service.getTotalUnreadCount(5)).resolves.toBe(5);
    });
  });
});
