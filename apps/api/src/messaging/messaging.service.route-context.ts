import {
  MessageReferenceType,
  Conversation,
  ConversationParticipant,
  Message,
  Resource,
  User,
} from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, Repository } from 'typeorm';
import { ResourceUsageService } from '../resources/usage/resourceUsage.service';
import { MessagingLiveService } from './messaging-live.service';
import { MessageRateLimitService } from './rate-limiting/message-rate-limit.service';

export interface MessageReference {
  referenceType: MessageReferenceType;
  referenceId: number;
}

export abstract class MessagingServiceRouteContext {
  protected abstract readonly messageRateLimitService: MessageRateLimitService;
  protected abstract readonly userRepository: Repository<User>;
  protected abstract findOneToOneConversation(userIdA: number, userIdB: number): Promise<Conversation | null>;
  protected abstract readonly dataSource: DataSource;
  protected abstract readonly participantRepository: Repository<ConversationParticipant>;
  protected abstract readonly conversationRepository: Repository<Conversation>;
  protected abstract assertParticipant(conversationId: number, userId: number): Promise<void>;
  protected abstract resolveReferenceDecoration(
    reference?: MessageReference,
  ): Promise<{ referenceLabel: string | null; referenceUrl: string | null }>;
  protected abstract readonly messageRepository: Repository<Message>;
  protected abstract readonly eventEmitter: EventEmitter2;
  protected abstract resolveOtherParticipant(conversationId: number, userId: number): Promise<User | null>;
  protected abstract readonly messagingLiveService: MessagingLiveService;
  protected abstract countUnread(conversationId: number, userId: number, lastReadAt: Date | null): Promise<number>;
  protected abstract readonly resourceRepository: Repository<Resource>;
  protected abstract readonly resourceUsageService: ResourceUsageService;
}
