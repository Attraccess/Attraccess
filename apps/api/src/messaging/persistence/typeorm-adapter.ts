import { MessageNotificationPersistence } from './port';
import { Conversation, ConversationParticipant, Message, Resource, User } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThan, Not, Repository } from 'typeorm';
import { toApplicationRecord } from '../../database/sqlite/backend';
import { MessagingLivePersistence, MessagingPersistence, NewMessage } from './port';

@Injectable()
export class TypeormMessagingLivePersistence extends MessagingLivePersistence {
  constructor(
    @InjectRepository(ConversationParticipant) protected readonly participantRows: Repository<ConversationParticipant>,
    @InjectRepository(Message) protected readonly messages: Repository<Message>,
  ) {
    super();
  }
  async messageWithSender(id: number): Promise<Message | null> {
    return toApplicationRecord(await this.messages.findOne({ where: { id }, relations: ['sender'] }));
  }
  async participants(conversationId: number): Promise<ConversationParticipant[]> {
    return toApplicationRecord(await this.participantRows.find({ where: { conversationId } }));
  }
}
@Injectable()
export class TypeormMessagingPersistence extends TypeormMessagingLivePersistence implements MessagingPersistence {
  constructor(
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
    @InjectRepository(ConversationParticipant) participants: Repository<ConversationParticipant>,
    @InjectRepository(Message) messages: Repository<Message>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    private readonly database: DataSource,
  ) {
    super(participants, messages);
  }
  async markRead(conversationId: number, userId: number, at: Date): Promise<void> {
    await this.participantRows.update({ conversationId, userId }, { lastReadAt: at });
  }
  async userParticipations(userId: number, withConversation: boolean): Promise<ConversationParticipant[]> {
    return toApplicationRecord(
      await this.participantRows.find({
        where: { userId },
        ...(withConversation ? { relations: ['conversation'] } : {}),
      }),
    );
  }
  async findParticipant(conversationId: number, userId: number): Promise<ConversationParticipant | null> {
    return toApplicationRecord(await this.participantRows.findOne({ where: { conversationId, userId } }));
  }
  async findUser(userId: number): Promise<User | null> {
    return toApplicationRecord(await this.users.findOne({ where: { id: userId } }));
  }
  async createPair(userIdA: number, userIdB: number): Promise<Conversation> {
    return this.database.transaction(async (manager) => {
      const conversation = await manager.save(manager.create(Conversation, {}));
      await manager.save([
        manager.create(ConversationParticipant, { conversationId: conversation.id, userId: userIdA }),
        manager.create(ConversationParticipant, { conversationId: conversation.id, userId: userIdB }),
      ]);
      return toApplicationRecord(conversation);
    });
  }
  async findPair(userIdA: number, userIdB: number): Promise<Conversation | null> {
    const row = await this.participantRows
      .createQueryBuilder('participant')
      .select('participant.conversationId', 'conversationId')
      .groupBy('participant.conversationId')
      .having('COUNT(*) = 2')
      .andHaving('SUM(CASE WHEN participant.userId IN (:...ids) THEN 1 ELSE 0 END) = 2', { ids: [userIdA, userIdB] })
      .orderBy('participant.conversationId', 'ASC')
      .getRawOne<{ conversationId: number }>();
    return row ? toApplicationRecord(await this.conversations.findOne({ where: { id: row.conversationId } })) : null;
  }
  async storeMessage(message: NewMessage): Promise<Message> {
    return toApplicationRecord(await this.messages.save(this.messages.create(message)));
  }
  async touchConversation(conversationId: number, at: Date): Promise<void> {
    await this.conversations.update({ id: conversationId }, { updatedAt: at });
  }
  async lastMessage(conversationId: number): Promise<Message | null> {
    return toApplicationRecord(
      await this.messages.findOne({ where: { conversationId }, relations: ['sender'], order: { createdAt: 'DESC' } }),
    );
  }
  async messagePage(conversationId: number, page: number, limit: number): Promise<[Message[], number]> {
    return toApplicationRecord(
      await this.messages.findAndCount({
        where: { conversationId },
        relations: ['sender'],
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    );
  }
  countUnread(conversationId: number, userId: number, lastReadAt: Date | null): Promise<number> {
    return this.messages.count({
      where: { conversationId, senderId: Not(userId), ...(lastReadAt ? { createdAt: MoreThan(lastReadAt) } : {}) },
    });
  }
  async otherParticipant(conversationId: number, userId: number): Promise<User | null> {
    const other = await this.participantRows
      .createQueryBuilder('participant')
      .leftJoinAndSelect('participant.user', 'user')
      .where('participant.conversationId = :conversationId', { conversationId })
      .andWhere('participant.userId != :userId', { userId })
      .getOne();
    return toApplicationRecord(other?.user ?? null);
  }
  async findResource(resourceId: number): Promise<Resource | null> {
    return toApplicationRecord(await this.resources.findOne({ where: { id: resourceId } }));
  }
}

@Injectable()
export class TypeormMessageNotificationPersistence extends MessageNotificationPersistence {
  constructor(
    @InjectRepository(ConversationParticipant) private readonly recipients: Repository<ConversationParticipant>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super();
  }
  async participantsWithUsers(conversationId: number): Promise<ConversationParticipant[]> {
    return toApplicationRecord(await this.recipients.find({ where: { conversationId }, relations: ['user'] }));
  }
  async sender(userId: number): Promise<User | null> {
    return toApplicationRecord(await this.users.findOne({ where: { id: userId } }));
  }
  async markNotified(participantId: number, at: Date): Promise<void> {
    await this.recipients.update({ id: participantId }, { lastNotifiedAt: at });
  }
}
