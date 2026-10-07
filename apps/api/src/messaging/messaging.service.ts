import { Conversation, ConversationParticipant, Message, Resource, User } from '@attraccess/database-entities';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ResourceUsageService } from '../resources/usage/resourceUsage.service';
import { ConversationWritingImplementation } from './conversation-writing';
import { MessagingLiveService } from './messaging-live.service';
import { MessageRateLimitService } from './rate-limiting/message-rate-limit.service';

@Injectable()
export class MessagingService extends ConversationWritingImplementation {
  constructor(
    @InjectRepository(Conversation)
    protected readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(ConversationParticipant)
    protected readonly participantRepository: Repository<ConversationParticipant>,
    @InjectRepository(Message)
    protected readonly messageRepository: Repository<Message>,
    @InjectRepository(User)
    protected readonly userRepository: Repository<User>,
    @InjectRepository(Resource)
    protected readonly resourceRepository: Repository<Resource>,
    protected readonly dataSource: DataSource,
    protected readonly resourceUsageService: ResourceUsageService,
    protected readonly eventEmitter: EventEmitter2,
    protected readonly messagingLiveService: MessagingLiveService,
    protected readonly messageRateLimitService: MessageRateLimitService,
  ) {
    super();
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

  protected async assertParticipant(conversationId: number, userId: number): Promise<void> {
    const participant = await this.participantRepository.findOne({ where: { conversationId, userId } });
    if (!participant) {
      throw new ForbiddenException('You are not a participant of this conversation');
    }
  }
}

export { MessageReference } from './messaging.service.route-context';
