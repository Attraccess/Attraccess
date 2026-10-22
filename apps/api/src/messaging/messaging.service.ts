import { Conversation, Message, User, MessageReferenceType } from '@attraccess/application-models';

import { ForbiddenException, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { MessagingPersistence } from './persistence/port';

import { ResourceUsageService } from '../resources/usage/sessions/resource-usage.service';

import { MessagingLiveService } from './messaging-live.service';

import { MessageRateLimitService } from './rate-limiting/message-rate-limit.service';

import { MessageCreatedEvent } from './events/message-created.event';

import { ConversationListItemDto } from './dtos/conversationListItem.dto';

export interface MessageReference {
  referenceType: MessageReferenceType;
  referenceId: number;
}

@Injectable()
export class MessagingService {
  constructor(
    protected readonly persistence: MessagingPersistence,
    protected readonly resourceUsageService: ResourceUsageService,
    protected readonly eventEmitter: EventEmitter2,
    protected readonly messagingLiveService: MessagingLiveService,
    protected readonly messageRateLimitService: MessageRateLimitService,
  ) {}

  public async markConversationRead(conversationId: number, userId: number): Promise<number> {
    await this.assertParticipant(conversationId, userId);
    await this.persistence.markRead(conversationId, userId, new Date());
    return this.getTotalUnreadCount(userId);
  }

  public async getTotalUnreadCount(userId: number): Promise<number> {
    const participations = await this.persistence.userParticipations(userId, false);
    const counts = await Promise.all(
      participations.map((participation) =>
        this.countUnread(participation.conversationId, userId, participation.lastReadAt),
      ),
    );
    return counts.reduce((total, count) => total + count, 0);
  }

  protected async assertParticipant(conversationId: number, userId: number): Promise<void> {
    const participant = await this.persistence.findParticipant(conversationId, userId);
    if (!participant) {
      throw new ForbiddenException('You are not a participant of this conversation');
    }
  }

  public async getOrCreateConversation(currentUserId: number, targetUserId: number): Promise<Conversation> {
    await this.messageRateLimitService.assertWithinLimit('contact', currentUserId);

    if (currentUserId === targetUserId) {
      throw new BadRequestException('Cannot start a conversation with yourself');
    }

    const targetUser = await this.persistence.findUser(targetUserId);
    if (!targetUser) {
      throw new NotFoundException(`User with ID ${targetUserId} not found`);
    }

    const existing = await this.findOneToOneConversation(currentUserId, targetUserId);
    if (existing) {
      return existing;
    }

    return this.persistence.createPair(currentUserId, targetUserId);
  }

  protected findOneToOneConversation(userIdA: number, userIdB: number): Promise<Conversation | null> {
    return this.persistence.findPair(userIdA, userIdB);
  }

  public async sendMessage(
    conversationId: number,
    senderId: number,
    content: string,
    reference?: MessageReference,
  ): Promise<Message> {
    await this.messageRateLimitService.assertWithinLimit('send_message', senderId);

    await this.assertParticipant(conversationId, senderId);

    const decoration = await this.resolveReferenceDecoration(reference);

    const message = await this.persistence.storeMessage({
      conversationId,
      senderId,
      content,
      referenceType: reference?.referenceType ?? null,
      referenceId: reference?.referenceId ?? null,
      referenceLabel: decoration.referenceLabel,
      referenceUrl: decoration.referenceUrl,
    });

    await this.persistence.touchConversation(conversationId, new Date());

    this.eventEmitter.emit(MessageCreatedEvent.EVENT_NAME, new MessageCreatedEvent(message));

    return message;
  }

  public async listConversations(userId: number): Promise<ConversationListItemDto[]> {
    const participations = await this.persistence.userParticipations(userId, true);

    const items = await Promise.all(
      participations.map(async (participation) => {
        const lastMessage = await this.persistence.lastMessage(participation.conversationId);

        const otherParticipant = await this.resolveOtherParticipant(participation.conversationId, userId);

        return {
          id: participation.conversationId,
          otherParticipant,
          otherParticipantOnline: otherParticipant ? this.messagingLiveService.isOnline(otherParticipant.id) : false,
          lastMessage,
          updatedAt: participation.conversation.updatedAt,
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
  ): Promise<{ data: Message[]; total: number; page: number; limit: number }> {
    await this.assertParticipant(conversationId, userId);

    const [data, total] = await this.persistence.messagePage(conversationId, page, limit);

    return { data, total, page, limit };
  }

  protected async countUnread(conversationId: number, userId: number, lastReadAt: Date | null): Promise<number> {
    return this.persistence.countUnread(conversationId, userId, lastReadAt);
  }

  protected resolveOtherParticipant(conversationId: number, userId: number): Promise<User | null> {
    return this.persistence.otherParticipant(conversationId, userId);
  }

  protected async resolveReferenceDecoration(
    reference?: MessageReference,
  ): Promise<{ referenceLabel: string | null; referenceUrl: string | null }> {
    if (reference?.referenceType === MessageReferenceType.RESOURCE) {
      const resource = await this.persistence.findResource(reference.referenceId);
      if (resource) {
        return { referenceLabel: resource.name, referenceUrl: `/resources/${resource.id}` };
      }
    }

    return { referenceLabel: null, referenceUrl: null };
  }

  public async resolveResourceHolder(resourceId: number): Promise<User | null> {
    const activeSession = await this.resourceUsageService.getActiveSession(resourceId);
    return activeSession?.user ?? null;
  }
}
