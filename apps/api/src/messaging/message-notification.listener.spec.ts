import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConversationParticipant, Message, User } from '@attraccess/database-entities';
import { MessageNotificationListener } from './message-notification.listener';
import { MessagingLiveService } from './messaging-live.service';
import { MessageCreatedEvent } from './events/message-created.event';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { NotificationCategory, NotificationChannel } from '../notifications/notification-types';

describe('MessageNotificationListener', () => {
  let listener: MessageNotificationListener;
  let participantRepository: { find: jest.Mock; update: jest.Mock };
  let userRepository: { findOne: jest.Mock };
  let liveService: { isOnline: jest.Mock };
  let notifications: { dispatch: jest.Mock; sendEmailTemplate: jest.Mock };

  const SENDER_ID = 1;
  const RECIPIENT_ID = 2;

  const buildMessage = (overrides: Partial<Message> = {}): Message =>
    ({
      id: 100,
      conversationId: 10,
      senderId: SENDER_ID,
      content: 'Hello there',
      createdAt: new Date('2025-01-18T12:00:00.000Z'),
      ...overrides,
    }) as Message;

  const buildParticipant = (overrides: Partial<ConversationParticipant> = {}): ConversationParticipant =>
    ({
      id: 50,
      conversationId: 10,
      userId: RECIPIENT_ID,
      lastReadAt: null,
      lastNotifiedAt: null,
      user: { id: RECIPIENT_ID, username: 'bob', email: 'bob@example.com' } as User,
      ...overrides,
    }) as ConversationParticipant;

  const offlineDispatches = () =>
    notifications.dispatch.mock.calls
      .map(([request]) => request)
      .filter((request) => request.channels.includes(NotificationChannel.EMAIL));

  const toastDispatches = () =>
    notifications.dispatch.mock.calls
      .map(([request]) => request)
      .filter((request) => request.channels.includes(NotificationChannel.TOAST));

  beforeEach(async () => {
    participantRepository = { find: jest.fn(), update: jest.fn().mockResolvedValue(undefined) };
    userRepository = { findOne: jest.fn().mockResolvedValue({ id: SENDER_ID, username: 'alice' } as User) };
    liveService = { isOnline: jest.fn().mockReturnValue(false) };
    notifications = {
      dispatch: jest.fn().mockResolvedValue(undefined),
      sendEmailTemplate: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageNotificationListener,
        { provide: getRepositoryToken(ConversationParticipant), useValue: participantRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: MessagingLiveService, useValue: liveService },
        { provide: NotificationDispatchService, useValue: notifications },
      ],
    }).compile();

    listener = module.get(MessageNotificationListener);
  });

  it('dispatches message email and push for an offline recipient through the shared notification path', async () => {
    participantRepository.find.mockResolvedValue([
      buildParticipant(),
      buildParticipant({ id: 51, userId: SENDER_ID, user: { id: SENDER_ID, username: 'alice' } as User }),
    ]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));

    expect(offlineDispatches()).toEqual([
      expect.objectContaining({
        category: NotificationCategory.MESSAGES,
        recipients: [expect.objectContaining({ id: RECIPIENT_ID, email: 'bob@example.com' })],
        actorId: SENDER_ID,
        channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
        title: 'alice',
        body: 'Hello there',
        url: '/messages?conversation=10',
        dedupeKey: 'message-conversation-10',
      }),
    ]);
  });

  it('dispatches in-app toasts through the shared message notification channel for every recipient', async () => {
    participantRepository.find.mockResolvedValue([buildParticipant()]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));

    expect(toastDispatches()).toEqual([
      {
        category: NotificationCategory.MESSAGES,
        recipients: [expect.objectContaining({ id: RECIPIENT_ID })],
        actorId: SENDER_ID,
        channels: [NotificationChannel.TOAST],
        title: 'alice',
        body: 'Hello there',
        url: '/messages?conversation=10',
        dedupeKey: 'message-conversation-10',
      },
    ]);
  });

  it('never dispatches to the sender', async () => {
    participantRepository.find.mockResolvedValue([
      buildParticipant({ id: 51, userId: SENDER_ID, user: { id: SENDER_ID, username: 'alice' } as User }),
    ]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('does not dispatch offline email or push for an online recipient', async () => {
    liveService.isOnline.mockReturnValue(true);
    participantRepository.find.mockResolvedValue([buildParticipant()]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));

    expect(offlineDispatches()).toEqual([]);
  });

  it('records the email delivery marker only when the shared dispatcher sends email', async () => {
    const participant = buildParticipant();
    participantRepository.find.mockResolvedValue([participant]);

    const message = buildMessage();
    await listener.handleMessageCreated(new MessageCreatedEvent(message));
    await offlineDispatches()[0].sendEmail(participant.user);

    expect(notifications.sendEmailTemplate).toHaveBeenCalledWith(
      participant.user,
      NotificationCategory.MESSAGES,
      { message: { conversationId: 10, senderName: 'alice', preview: 'Hello there' } },
    );
    expect(participantRepository.update).toHaveBeenCalledWith({ id: 50 }, { lastNotifiedAt: message.createdAt });
  });

  it('does not re-send email within the same unread burst', async () => {
    const participant = buildParticipant({ lastNotifiedAt: new Date('2025-01-18T11:00:00.000Z'), lastReadAt: null });
    participantRepository.find.mockResolvedValue([participant]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));
    await offlineDispatches()[0].sendEmail(participant.user);

    expect(notifications.sendEmailTemplate).not.toHaveBeenCalled();
    expect(participantRepository.update).not.toHaveBeenCalled();
  });

  it('does not re-send email when notified after the last read', async () => {
    const participant = buildParticipant({
      lastReadAt: new Date('2025-01-18T10:00:00.000Z'),
      lastNotifiedAt: new Date('2025-01-18T11:00:00.000Z'),
    });
    participantRepository.find.mockResolvedValue([participant]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));
    await offlineDispatches()[0].sendEmail(participant.user);

    expect(notifications.sendEmailTemplate).not.toHaveBeenCalled();
  });

  it('starts a new email burst once the recipient has read past the last notification', async () => {
    const participant = buildParticipant({
      lastNotifiedAt: new Date('2025-01-18T10:00:00.000Z'),
      lastReadAt: new Date('2025-01-18T11:00:00.000Z'),
    });
    participantRepository.find.mockResolvedValue([participant]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));
    await offlineDispatches()[0].sendEmail(participant.user);

    expect(notifications.sendEmailTemplate).toHaveBeenCalledTimes(1);
  });

  it('skips email recipients without an email address', async () => {
    const participant = buildParticipant({ user: { id: RECIPIENT_ID, username: 'bob', email: null } as unknown as User });
    participantRepository.find.mockResolvedValue([participant]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));
    await offlineDispatches()[0].sendEmail(participant.user);

    expect(notifications.sendEmailTemplate).not.toHaveBeenCalled();
    expect(participantRepository.update).not.toHaveBeenCalled();
  });

  it('isolates per-recipient dispatch failures so other recipients are still processed', async () => {
    const failing = buildParticipant({ id: 50, userId: RECIPIENT_ID });
    const other = buildParticipant({
      id: 52,
      userId: 3,
      user: { id: 3, username: 'carol', email: 'carol@example.com' } as User,
    });
    participantRepository.find.mockResolvedValue([failing, other]);
    notifications.dispatch.mockImplementation((request) => {
      if (request.channels.includes(NotificationChannel.EMAIL) && request.recipients[0].id === RECIPIENT_ID) {
        return Promise.reject(new Error('push down'));
      }
      return Promise.resolve(undefined);
    });

    await expect(listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()))).resolves.toBeUndefined();

    expect(offlineDispatches()).toHaveLength(2);
  });

  it('truncates long push previews', async () => {
    participantRepository.find.mockResolvedValue([buildParticipant()]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage({ content: 'x'.repeat(200) })));

    expect(offlineDispatches()[0]).toEqual(expect.objectContaining({ body: `${'x'.repeat(140)}…` }));
  });

  it('dispatches push per message even within the same email burst', async () => {
    participantRepository.find.mockResolvedValue([
      buildParticipant({ lastNotifiedAt: new Date('2025-01-18T11:00:00.000Z'), lastReadAt: null }),
    ]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));

    expect(offlineDispatches()).toHaveLength(1);
  });

  it('falls back to a generic sender name when the sender is missing', async () => {
    userRepository.findOne.mockResolvedValue(null);
    participantRepository.find.mockResolvedValue([buildParticipant()]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));

    expect(offlineDispatches()[0]).toEqual(expect.objectContaining({ title: 'Someone' }));
  });
});
