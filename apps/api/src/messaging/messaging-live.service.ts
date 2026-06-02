import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Subject } from 'rxjs';
import { Repository } from 'typeorm';
import { ConversationParticipant, Message } from '@attraccess/database-entities';
import { MessageCreatedEvent } from './events/message-created.event';

@Injectable()
export class MessagingLiveService {
  private readonly messageSubjects: Map<number, Subject<{ data: Message }>> = new Map();

  public constructor(
    @InjectRepository(ConversationParticipant)
    private readonly participantRepository: Repository<ConversationParticipant>,
  ) {}

  public getUserMessageSubject(userId: number): Subject<{ data: Message }> {
    if (!this.messageSubjects.has(userId)) {
      this.messageSubjects.set(userId, new Subject<{ data: Message }>());
    }
    return this.messageSubjects.get(userId);
  }

  @OnEvent(MessageCreatedEvent.EVENT_NAME)
  public async notifyNewMessage(event: MessageCreatedEvent): Promise<void> {
    const message = event.message;

    const participants = await this.participantRepository.find({
      where: { conversationId: message.conversationId },
    });

    for (const participant of participants) {
      if (participant.userId === message.senderId) {
        continue;
      }
      this.getUserMessageSubject(participant.userId).next({ data: message });
    }
  }
}
