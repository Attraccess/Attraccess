import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Observable, Subject } from 'rxjs';
import type { MessageRecord } from '@attraccess/application-models';
import { CONVERSATION_STORE, ConversationStore } from './conversation-store.port';
import { MessageCreatedEvent } from './events/message-created.event';

@Injectable()
export class MessagingLiveService {
  private readonly messageSubjects: Map<number, Subject<{ data: MessageRecord }>> = new Map();
  private readonly connectionCounts: Map<number, number> = new Map();

  public constructor(
    @Inject(CONVERSATION_STORE)
    private readonly store: ConversationStore,
  ) {}

  public getUserMessageSubject(userId: number): Subject<{ data: MessageRecord }> {
    if (!this.messageSubjects.has(userId)) {
      this.messageSubjects.set(userId, new Subject<{ data: MessageRecord }>());
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
      const subject = this.messageSubjects.get(userId);
      if (subject && !subject.observed) {
        this.messageSubjects.delete(userId);
      }
    }
  }

  @OnEvent(MessageCreatedEvent.EVENT_NAME)
  public async notifyNewMessage(event: MessageCreatedEvent): Promise<void> {
    const message = event.message;
    const messageWithSender = (await this.store.findMessageWithSender(message.id)) ?? message;

    const participantUserIds = await this.store.participantUserIds(message.conversationId);

    for (const userId of participantUserIds) {
      if (userId === message.senderId) {
        continue;
      }
      this.messageSubjects.get(userId)?.next({ data: messageWithSender });
    }
  }
}
