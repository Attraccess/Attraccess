import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThan, Not, Repository } from 'typeorm';
import {
  Conversation,
  ConversationParticipant,
  Message,
  MessageReferenceType,
  NotificationPreference,
  Resource,
  User,
} from '@attraccess/database-entities';
import { ResourceUsageService } from '../resources/usage/resourceUsage.service';
import { MessageCreatedEvent } from './events/message-created.event';
import { ConversationListItemDto } from './dtos/conversationListItem.dto';
import { MessagingLiveService } from './messaging-live.service';
import { NotificationPreferenceDto } from './dtos/notificationPreference.dto';
import { UpdateNotificationPreferenceDto } from './dtos/updateNotificationPreference.dto';
import { MessageRateLimitService } from './rate-limiting/message-rate-limit.service';

export interface MessageReference {
  referenceType: MessageReferenceType;
  referenceId: number;
}

@Injectable()
export class MessagingService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(ConversationParticipant)
    private readonly participantRepository: Repository<ConversationParticipant>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(NotificationPreference)
    private readonly notificationPreferenceRepository: Repository<NotificationPreference>,
    private readonly dataSource: DataSource,
    private readonly resourceUsageService: ResourceUsageService,
    private readonly eventEmitter: EventEmitter2,
    private readonly messagingLiveService: MessagingLiveService,
    private readonly messageRateLimitService: MessageRateLimitService,
  ) {}

  public async getOrCreateConversation(currentUserId: number, targetUserId: number): Promise<Conversation> {
    await this.messageRateLimitService.assertWithinLimit('contact', currentUserId);

    if (currentUserId === targetUserId) {
      throw new BadRequestException('Cannot start a conversation with yourself');
    }

    const targetUser = await this.userRepository.findOne({ where: { id: targetUserId } });
    if (!targetUser) {
      throw new NotFoundException(`User with ID ${targetUserId} not found`);
    }

    const existing = await this.findOneToOneConversation(currentUserId, targetUserId);
    if (existing) {
      return existing;
    }

    return await this.dataSource.transaction(async (manager) => {
      const conversation = await manager.save(manager.create(Conversation, {}));
      await manager.save([
        manager.create(ConversationParticipant, { conversationId: conversation.id, userId: currentUserId }),
        manager.create(ConversationParticipant, { conversationId: conversation.id, userId: targetUserId }),
      ]);
      return conversation;
    });
  }

  private async findOneToOneConversation(userIdA: number, userIdB: number): Promise<Conversation | null> {
    const row = await this.participantRepository
      .createQueryBuilder('participant')
      .select('participant.conversationId', 'conversationId')
      .groupBy('participant.conversationId')
      .having('COUNT(*) = 2')
      .andHaving('SUM(CASE WHEN participant.userId IN (:...ids) THEN 1 ELSE 0 END) = 2', {
        ids: [userIdA, userIdB],
      })
      .orderBy('participant.conversationId', 'ASC')
      .getRawOne<{ conversationId: number }>();

    if (!row) {
      return null;
    }

    return await this.conversationRepository.findOne({ where: { id: row.conversationId } });
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

    const message = await this.messageRepository.save(
      this.messageRepository.create({
        conversationId,
        senderId,
        content,
        referenceType: reference?.referenceType ?? null,
        referenceId: reference?.referenceId ?? null,
        referenceLabel: decoration.referenceLabel,
        referenceUrl: decoration.referenceUrl,
      }),
    );

    await this.conversationRepository.update({ id: conversationId }, { updatedAt: new Date() });

    this.eventEmitter.emit(MessageCreatedEvent.EVENT_NAME, new MessageCreatedEvent(message));

    return message;
  }

  public async listMessages(
    conversationId: number,
    userId: number,
    page = 1,
    limit = 20,
  ): Promise<{ data: Message[]; total: number; page: number; limit: number }> {
    await this.assertParticipant(conversationId, userId);

    const [data, total] = await this.messageRepository.findAndCount({
      where: { conversationId },
      relations: ['sender'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  public async listConversations(userId: number): Promise<ConversationListItemDto[]> {
    const participations = await this.participantRepository.find({
      where: { userId },
      relations: ['conversation'],
    });

    const items = await Promise.all(
      participations.map(async (participation) => {
        const lastMessage = await this.messageRepository.findOne({
          where: { conversationId: participation.conversationId },
          relations: ['sender'],
          order: { createdAt: 'DESC' },
        });

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

  public async markConversationRead(conversationId: number, userId: number): Promise<number> {
    await this.assertParticipant(conversationId, userId);
    await this.participantRepository.update({ conversationId, userId }, { lastReadAt: new Date() });
    return this.getTotalUnreadCount(userId);
  }

  public async getTotalUnreadCount(userId: number): Promise<number> {
    const participations = await this.participantRepository.find({ where: { userId } });
    const counts = await Promise.all(
      participations.map((participation) =>
        this.countUnread(participation.conversationId, userId, participation.lastReadAt),
      ),
    );
    return counts.reduce((total, count) => total + count, 0);
  }

  private async countUnread(conversationId: number, userId: number, lastReadAt: Date | null): Promise<number> {
    return this.messageRepository.count({
      where: {
        conversationId,
        senderId: Not(userId),
        ...(lastReadAt ? { createdAt: MoreThan(lastReadAt) } : {}),
      },
    });
  }

  private async resolveOtherParticipant(conversationId: number, userId: number): Promise<User | null> {
    const other = await this.participantRepository
      .createQueryBuilder('participant')
      .leftJoinAndSelect('participant.user', 'user')
      .where('participant.conversationId = :conversationId', { conversationId })
      .andWhere('participant.userId != :userId', { userId })
      .getOne();

    return other?.user ?? null;
  }

  private async resolveReferenceDecoration(
    reference?: MessageReference,
  ): Promise<{ referenceLabel: string | null; referenceUrl: string | null }> {
    if (reference?.referenceType === MessageReferenceType.RESOURCE) {
      const resource = await this.resourceRepository.findOne({ where: { id: reference.referenceId } });
      if (resource) {
        return { referenceLabel: resource.name, referenceUrl: `/resources/${resource.id}` };
      }
    }

    return { referenceLabel: null, referenceUrl: null };
  }

  public async resolveResourceHolder(resourceId: number): Promise<User | null> {
    const activeSession = await this.resourceUsageService.getActiveSession(resourceId, true);
    return activeSession?.user ?? null;
  }

  private async assertParticipant(conversationId: number, userId: number): Promise<void> {
    const participant = await this.participantRepository.findOne({ where: { conversationId, userId } });
    if (!participant) {
      throw new ForbiddenException('You are not a participant of this conversation');
    }
  }

  public async getNotificationPreference(userId: number): Promise<NotificationPreferenceDto> {
    const preference = await this.notificationPreferenceRepository.findOne({ where: { userId } });
    return { messagesEmailOnOffline: preference?.messagesEmailOnOffline ?? true };
  }

  public async updateNotificationPreference(
    userId: number,
    dto: UpdateNotificationPreferenceDto,
  ): Promise<NotificationPreferenceDto> {
    const existing = await this.notificationPreferenceRepository.findOne({ where: { userId } });
    const preference =
      existing ?? this.notificationPreferenceRepository.create({ userId, messagesEmailOnOffline: true });

    if (dto.messagesEmailOnOffline !== undefined) {
      preference.messagesEmailOnOffline = dto.messagesEmailOnOffline;
    }

    const saved = await this.notificationPreferenceRepository.save(preference);
    return { messagesEmailOnOffline: saved.messagesEmailOnOffline };
  }

  public async shouldEmailMessageOnOffline(userId: number): Promise<boolean> {
    return (await this.getNotificationPreference(userId)).messagesEmailOnOffline;
  }
}
