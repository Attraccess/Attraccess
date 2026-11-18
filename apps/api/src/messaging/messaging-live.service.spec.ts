import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom, take, toArray } from 'rxjs';
import type { MessageRecord } from '@attraccess/application-models';
import { CONVERSATION_STORE } from './conversation-store.port';
import { MessagingLiveService } from './messaging-live.service';
import { MessageCreatedEvent } from './events/message-created.event';

describe('MessagingLiveService', () => {
  let service: MessagingLiveService;
  let store: { participantUserIds: jest.Mock; findMessageWithSender: jest.Mock };

  beforeEach(async () => {
    store = { participantUserIds: jest.fn(), findMessageWithSender: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MessagingLiveService, { provide: CONVERSATION_STORE, useValue: store }],
    }).compile();

    service = module.get(MessagingLiveService);
  });

  it('returns a stable subject per user', () => {
    const first = service.getUserMessageSubject(1);
    const second = service.getUserMessageSubject(1);
    expect(first).toBe(second);
  });

  it('reports a user online while a tracked stream is subscribed and offline after teardown', () => {
    expect(service.isOnline(1)).toBe(false);

    const subscription = service.trackPresence(1, service.getUserMessageSubject(1).asObservable()).subscribe();
    expect(service.isOnline(1)).toBe(true);

    const second = service.trackPresence(1, service.getUserMessageSubject(1).asObservable()).subscribe();
    subscription.unsubscribe();
    expect(service.isOnline(1)).toBe(true);

    second.unsubscribe();
    expect(service.isOnline(1)).toBe(false);
  });

  it('pushes the new message to every recipient except the sender', async () => {
    store.participantUserIds.mockResolvedValue([5, 9]);

    const message = { id: 3, conversationId: 1, senderId: 5 } as MessageRecord;
    const messageWithSender = { ...message, sender: { id: 5, username: 'sender' } } as MessageRecord;
    store.findMessageWithSender.mockResolvedValue(messageWithSender);

    const recipientEvents = firstValueFrom(service.getUserMessageSubject(9).pipe(take(1), toArray()));

    const senderEvents: { data: MessageRecord }[] = [];
    service.getUserMessageSubject(5).subscribe((event) => senderEvents.push(event));

    await service.notifyNewMessage(new MessageCreatedEvent(message));

    expect(store.findMessageWithSender).toHaveBeenCalledWith(3);
    await expect(recipientEvents).resolves.toEqual([{ data: messageWithSender }]);
    expect(senderEvents).toHaveLength(0);
  });
});
