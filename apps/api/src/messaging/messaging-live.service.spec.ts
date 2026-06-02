import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { firstValueFrom, take, toArray } from 'rxjs';
import { ConversationParticipant, Message } from '@attraccess/database-entities';
import { MessagingLiveService } from './messaging-live.service';
import { MessageCreatedEvent } from './events/message-created.event';

describe('MessagingLiveService', () => {
  let service: MessagingLiveService;
  let participantRepository: { find: jest.Mock };

  beforeEach(async () => {
    participantRepository = { find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingLiveService,
        { provide: getRepositoryToken(ConversationParticipant), useValue: participantRepository },
      ],
    }).compile();

    service = module.get(MessagingLiveService);
  });

  it('returns a stable subject per user', () => {
    const first = service.getUserMessageSubject(1);
    const second = service.getUserMessageSubject(1);
    expect(first).toBe(second);
  });

  it('pushes the new message to every recipient except the sender', async () => {
    participantRepository.find.mockResolvedValue([
      { userId: 5 } as ConversationParticipant,
      { userId: 9 } as ConversationParticipant,
    ]);

    const message = { id: 3, conversationId: 1, senderId: 5 } as Message;

    const recipientEvents = firstValueFrom(
      service.getUserMessageSubject(9).pipe(take(1), toArray()),
    );

    const senderEvents: { data: Message }[] = [];
    service.getUserMessageSubject(5).subscribe((event) => senderEvents.push(event));

    await service.notifyNewMessage(new MessageCreatedEvent(message));

    await expect(recipientEvents).resolves.toEqual([{ data: message }]);
    expect(senderEvents).toHaveLength(0);
  });
});
