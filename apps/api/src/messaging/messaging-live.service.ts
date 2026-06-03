import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, Subject } from 'rxjs';
import { Repository } from 'typeorm';
import { ConversationParticipant, Message } from '@attraccess/database-entities';
import { MessageCreatedEvent } from './events/message-created.event';

@Injectable()
export class MessagingLiveService {
  private readonly messageSubjects: Map<number, Subject<{ data: Message }>> = new Map();
  private readonly connectionCounts: Map<number, number> = new Map();

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

  // Presence is derived from live SSE subscriptions, not Session.lastAccessedAt.
  // lastAccessedAt is an @UpdateDateColumn that is unreliable for JWT/SPA clients:
  // a stateless JWT is validated without touching the Session row, so the column
  // can stay stale for an active user or fresh for one who already closed the tab.
  // An open /messaging/live stream is the only signal that the user is truly connected.
  public trackPresence<T>(userId: number, source: Observable<T>): Observable<T> {
    return new Observable<T>((subscriber) => {
      this.addConnection(userId);
      const sub = source.subscribe(subscriber);
      return () => {
        sub.unsubscribe();
        this.removeConnection(userId);
      };
    });
  }

  public isOnline(userId: number): boolean {
    return (this.connectionCounts.get(userId) ?? 0) > 0;
  }

  private addConnection(userId: number): void {
    this.connectionCounts.set(userId, (this.connectionCounts.get(userId) ?? 0) + 1);
  }

  private removeConnection(userId: number): void {
    const next = (this.connectionCounts.get(userId) ?? 0) - 1;
    if (next > 0) {
      this.connectionCounts.set(userId, next);
    } else {
      this.connectionCounts.delete(userId);
    }
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
