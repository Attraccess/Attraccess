import { Conversation, ConversationParticipant, Message } from '@attraccess/database-entities';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConversationQueryImplementation } from './conversation-query';
import { MessageCreatedEvent } from './events/message-created.event';
import { MessageReference } from './messaging.service.route-context';
export abstract class ConversationWritingImplementation extends ConversationQueryImplementation {
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

  protected async findOneToOneConversation(userIdA: number, userIdB: number): Promise<Conversation | null> {
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
}
