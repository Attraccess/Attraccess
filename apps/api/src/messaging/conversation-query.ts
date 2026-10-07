import { Message, MessageReferenceType, User } from '@attraccess/database-entities';
import { MoreThan, Not } from 'typeorm';
import { ConversationListItemDto } from './dtos/conversationListItem.dto';
import { MessageReference } from './messaging.service.route-context';
import { MessagingServiceRouteContext } from './messaging.service.route-context';
export abstract class ConversationQueryImplementation extends MessagingServiceRouteContext {
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

  protected async countUnread(conversationId: number, userId: number, lastReadAt: Date | null): Promise<number> {
    return this.messageRepository.count({
      where: {
        conversationId,
        senderId: Not(userId),
        ...(lastReadAt ? { createdAt: MoreThan(lastReadAt) } : {}),
      },
    });
  }

  protected async resolveOtherParticipant(conversationId: number, userId: number): Promise<User | null> {
    const other = await this.participantRepository
      .createQueryBuilder('participant')
      .leftJoinAndSelect('participant.user', 'user')
      .where('participant.conversationId = :conversationId', { conversationId })
      .andWhere('participant.userId != :userId', { userId })
      .getOne();

    return other?.user ?? null;
  }

  protected async resolveReferenceDecoration(
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
}
