import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { formatUserDisplayName } from '@attraccess/shared';
import { ConversationParticipant, User } from '@attraccess/database-entities';
import { MessageNotificationStore, NotifiableParticipant } from '../../../messaging/message-notification-store.port';

@Injectable()
export class TypeOrmMessageNotificationStore implements MessageNotificationStore {
  constructor(
    @InjectRepository(ConversationParticipant) private readonly participants: Repository<ConversationParticipant>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async findParticipants(conversationId: number): Promise<NotifiableParticipant[]> {
    const rows = await this.participants.find({ where: { conversationId }, relations: { user: true } });
    return rows.map((row) => ({
      participantId: row.id,
      userId: row.userId,
      lastReadAt: row.lastReadAt,
      lastNotifiedAt: row.lastNotifiedAt,
      recipient: row.user
        ? {
            id: row.user.id,
            username: row.user.username,
            firstName: row.user.firstName,
            lastName: row.user.lastName,
            email: row.user.email,
            locale: row.user.locale,
          }
        : null,
    }));
  }

  async findDisplayName(userId: number): Promise<string | null> {
    const user = await this.users.findOne({ where: { id: userId } });
    return user ? formatUserDisplayName(user) : null;
  }

  async markNotified(participantId: number, notifiedAt: Date): Promise<void> {
    await this.participants.update({ id: participantId }, { lastNotifiedAt: notifiedAt });
  }
}
