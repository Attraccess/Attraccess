import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThan, Not, Repository } from 'typeorm';
import { Conversation, ConversationParticipant, Message, Resource, User } from '@attraccess/database-entities';
import {
  ConversationParticipation,
  ConversationRecord,
  MessageRecord,
  MessagingUser,
  NewMessage,
} from '@attraccess/application-models';
import { ConversationStore } from '../../../messaging/conversation-store.port';

export const toMessagingUser = (user: User): MessagingUser => ({
  id: user.id,
  username: user.username,
  firstName: user.firstName,
  lastName: user.lastName,
  locale: user.locale,
  dateTimeLocale: user.dateTimeLocale,
  isEmailVerified: user.isEmailVerified,
  isDisabled: user.isDisabled,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  deletedAt: user.deletedAt,
  externalIdentifier: user.externalIdentifier,
  creditBalance: user.creditBalance,
  billingFactor: user.billingFactor,
});

const toConversation = (row: Conversation): ConversationRecord => ({
  id: row.id,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toMessage = (row: Message): MessageRecord => ({
  id: row.id,
  conversationId: row.conversationId,
  senderId: row.senderId,
  content: row.content,
  referenceType: row.referenceType,
  referenceId: row.referenceId,
  referenceLabel: row.referenceLabel,
  referenceUrl: row.referenceUrl,
  createdAt: row.createdAt,
  ...(row.sender ? { sender: toMessagingUser(row.sender) } : {}),
});

@Injectable()
export class TypeOrmConversationStore implements ConversationStore {
  constructor(
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
    @InjectRepository(ConversationParticipant) private readonly participants: Repository<ConversationParticipant>,
    @InjectRepository(Message) private readonly messages: Repository<Message>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    private readonly dataSource: DataSource,
  ) {}

  async isParticipant(conversationId: number, userId: number): Promise<boolean> {
    return (await this.participants.findOne({ where: { conversationId, userId } })) !== null;
  }

  async markRead(conversationId: number, userId: number, readAt: Date): Promise<void> {
    await this.participants.update({ conversationId, userId }, { lastReadAt: readAt });
  }

  async listParticipations(userId: number): Promise<ConversationParticipation[]> {
    const rows = await this.participants.find({ where: { userId }, relations: { conversation: true } });
    return rows.map((row) => ({
      participantId: row.id,
      conversationId: row.conversationId,
      userId: row.userId,
      lastReadAt: row.lastReadAt,
      lastNotifiedAt: row.lastNotifiedAt,
      conversationUpdatedAt: row.conversation.updatedAt,
    }));
  }

  countUnread(conversationId: number, userId: number, lastReadAt: Date | null): Promise<number> {
    return this.messages.count({
      where: {
        conversationId,
        senderId: Not(userId),
        ...(lastReadAt ? { createdAt: MoreThan(lastReadAt) } : {}),
      },
    });
  }

  async userExists(userId: number): Promise<boolean> {
    return (await this.users.findOne({ where: { id: userId } })) !== null;
  }

  async findOneToOneConversation(userIdA: number, userIdB: number): Promise<ConversationRecord | null> {
    const row = await this.participants
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

    const conversation = await this.conversations.findOne({ where: { id: row.conversationId } });
    return conversation ? toConversation(conversation) : null;
  }

  createOneToOneConversation(userIdA: number, userIdB: number): Promise<ConversationRecord> {
    return this.dataSource.transaction(async (manager) => {
      const conversation = await manager.save(manager.create(Conversation, {}));
      await manager.save([
        manager.create(ConversationParticipant, { conversationId: conversation.id, userId: userIdA }),
        manager.create(ConversationParticipant, { conversationId: conversation.id, userId: userIdB }),
      ]);
      return toConversation(conversation);
    });
  }

  async findResourceName(resourceId: number): Promise<string | null> {
    const resource = await this.resources.findOne({ where: { id: resourceId } });
    return resource ? resource.name : null;
  }

  async appendMessage(message: NewMessage): Promise<MessageRecord> {
    const saved = await this.messages.save(this.messages.create(message));
    await this.conversations.update({ id: message.conversationId }, { updatedAt: new Date() });
    return toMessage(saved);
  }

  async findLastMessage(conversationId: number): Promise<MessageRecord | null> {
    const row = await this.messages.findOne({
      where: { conversationId },
      relations: { sender: true },
      order: { createdAt: 'DESC' },
    });
    return row ? toMessage(row) : null;
  }

  async findMessageWithSender(messageId: number): Promise<MessageRecord | null> {
    const row = await this.messages.findOne({ where: { id: messageId }, relations: { sender: true } });
    return row ? toMessage(row) : null;
  }

  async findOtherParticipant(conversationId: number, userId: number): Promise<MessagingUser | null> {
    const other = await this.participants
      .createQueryBuilder('participant')
      .leftJoinAndSelect('participant.user', 'user')
      .where('participant.conversationId = :conversationId', { conversationId })
      .andWhere('participant.userId != :userId', { userId })
      .getOne();

    return other?.user ? toMessagingUser(other.user) : null;
  }

  async pageMessages(
    conversationId: number,
    page: number,
    limit: number,
  ): Promise<{ data: MessageRecord[]; total: number }> {
    const [rows, total] = await this.messages.findAndCount({
      where: { conversationId },
      relations: { sender: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: rows.map(toMessage), total };
  }

  async participantUserIds(conversationId: number): Promise<number[]> {
    const rows = await this.participants.find({ where: { conversationId } });
    return rows.map((row) => row.userId);
  }
}
