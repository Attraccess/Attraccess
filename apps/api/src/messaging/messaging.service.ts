import { ConversationRecord, MessageRecord, MessageReferenceType, MessagingUser } from '@attraccess/application-models';

import { ForbiddenException, Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { ResourceUsageService } from '../resources/usage/sessions/resource-usage.service';

import { MessagingLiveService } from './messaging-live.service';

import { MessageRateLimitService } from './rate-limiting/message-rate-limit.service';

import { MessageCreatedEvent } from './events/message-created.event';

import { ConversationListItemDto } from './dtos/conversationListItem.dto';

import { CONVERSATION_STORE, ConversationStore } from './conversation-store.port';

export interface MessageReference {
  referenceType: MessageReferenceType;
  referenceId: number;
}

@Injectable()
export class MessagingService {
  constructor(
    @Inject(CONVERSATION_STORE)
    protected readonly store: ConversationStore,
    protected readonly resourceUsageService: ResourceUsageService,
    protected readonly eventEmitter: EventEmitter2,
    protected readonly messagingLiveService: MessagingLiveService,
    protected readonly messageRateLimitService: MessageRateLimitService,
  ) {}

  public async markConversationRead(conversationId: number, userId: number): Promise<number> {
    await this.assertParticipant(conversationId, userId);
    await this.store.markRead(conversationId, userId, new Date());
    return this.getTotalUnreadCount(userId);
  }

  public async getTotalUnreadCount(userId: number): Promise<number> {
    const participations = await this.store.listParticipations(userId);
    const counts = await Promise.all(
      participations.map((participation) =>
        this.countUnread(participation.conversationId, userId, participation.lastReadAt),
      ),
    );
    return counts.reduce((total, count) => total + count, 0);
  }

  protected async assertParticipant(conversationId: number, userId: number): Promise<void> {
    if (!(await this.store.isParticipant(conversationId, userId))) {
      throw new ForbiddenException('You are not a participant of this conversation');
    }
  }

  public async getOrCreateConversation(currentUserId: number, targetUserId: number): Promise<ConversationRecord> {
    await this.messageRateLimitService.assertWithinLimit('contact', currentUserId);

    if (currentUserId === targetUserId) {
      throw new BadRequestException('Cannot start a conversation with yourself');
    }

    if (!(await this.store.userExists(targetUserId))) {
      throw new NotFoundException(`User with ID ${targetUserId} not found`);
    }

    const existing = await this.store.findOneToOneConversation(currentUserId, targetUserId);
    if (existing) {
      return existing;
    }

    return await this.store.createOneToOneConversation(currentUserId, targetUserId);
  }

  public async sendMessage(
    conversationId: number,
    senderId: number,
    content: string,
    reference?: MessageReference,
    { labelReference = true }: { labelReference?: boolean } = {},
  ): Promise<MessageRecord> {
    await this.messageRateLimitService.assertWithinLimit('send_message', senderId);

    await this.assertParticipant(conversationId, senderId);

    // Without a label the reference is stored like one to a machine that does not exist (ATT-843: a machine hidden
    // from the sender must not reveal its name).
    const decoration = labelReference
      ? await this.resolveReferenceDecoration(reference)
      : { referenceLabel: null, referenceUrl: null };

    const message = await this.store.appendMessage({
      conversationId,
      senderId,
      content,
      referenceType: reference?.referenceType ?? null,
      referenceId: reference?.referenceId ?? null,
      referenceLabel: decoration.referenceLabel,
      referenceUrl: decoration.referenceUrl,
    });

    this.eventEmitter.emit(MessageCreatedEvent.EVENT_NAME, new MessageCreatedEvent(message));

    return message;
  }

  public async listConversations(userId: number): Promise<ConversationListItemDto[]> {
    const participations = await this.store.listParticipations(userId);

    const items = await Promise.all(
      participations.map(async (participation) => {
        const lastMessage = await this.store.findLastMessage(participation.conversationId);

        const otherParticipant = await this.resolveOtherParticipant(participation.conversationId, userId);

        return {
          id: participation.conversationId,
          otherParticipant,
          otherParticipantOnline: otherParticipant ? this.messagingLiveService.isOnline(otherParticipant.id) : false,
          lastMessage,
          updatedAt: participation.conversationUpdatedAt,
          unreadCount: await this.countUnread(participation.conversationId, userId, participation.lastReadAt),
        };
      }),
    );

    return items.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt?.getTime() ?? a.updatedAt.getTime();
      const bTime = b.lastMessage?.createdAt?.getTime() ?? b.updatedAt.getTime();
      return bTime - aTime;
    });
  }

  public async listMessages(
    conversationId: number,
    userId: number,
    page = 1,
    limit = 20,
  ): Promise<{ data: MessageRecord[]; total: number; page: number; limit: number }> {
    await this.assertParticipant(conversationId, userId);

    const { data, total } = await this.store.pageMessages(conversationId, page, limit);

    return { data, total, page, limit };
  }

  protected async countUnread(conversationId: number, userId: number, lastReadAt: Date | null): Promise<number> {
    return this.store.countUnread(conversationId, userId, lastReadAt);
  }

  protected async resolveOtherParticipant(conversationId: number, userId: number): Promise<MessagingUser | null> {
    return this.store.findOtherParticipant(conversationId, userId);
  }

  protected async resolveReferenceDecoration(
    reference?: MessageReference,
  ): Promise<{ referenceLabel: string | null; referenceUrl: string | null }> {
    if (reference?.referenceType === MessageReferenceType.RESOURCE) {
      const resourceName = await this.store.findResourceName(reference.referenceId);
      if (resourceName !== null) {
        return { referenceLabel: resourceName, referenceUrl: `/resources/${reference.referenceId}` };
      }
    }

    return { referenceLabel: null, referenceUrl: null };
  }

  /** With several parallel sessions the sender must pick whose session they mean (`userId`). */
  public async resolveResourceHolder(resourceId: number, userId?: number): Promise<{ id: number } | null> {
    const sessions = await this.resourceUsageService.getActiveSessionsForResource(resourceId);
    if (userId !== undefined) return sessions.find((session) => session.userId === userId)?.user ?? null;
    if (sessions.length > 1) {
      throw new BadRequestException('Several people are using this resource; choose whom to contact');
    }
    return sessions[0]?.user ?? null;
  }
}
