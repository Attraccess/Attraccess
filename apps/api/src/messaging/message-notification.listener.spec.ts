import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConversationParticipant, Message, User } from '@attraccess/database-entities';
import { MessageNotificationListener } from './message-notification.listener';
import { MessagingLiveService } from './messaging-live.service';
import { MessagingService } from './messaging.service';
import { EmailService } from '../email/email.service';
import { MessageCreatedEvent } from './events/message-created.event';

describe('MessageNotificationListener', () => {
  let listener: MessageNotificationListener;
  let participantRepository: { find: jest.Mock; update: jest.Mock };
  let userRepository: { findOne: jest.Mock };
  let liveService: { isOnline: jest.Mock };
  let messagingService: { shouldEmailMessageOnOffline: jest.Mock };
  let emailService: { sendNewMessageEmail: jest.Mock };

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
    } as Message);

  const buildParticipant = (overrides: Partial<ConversationParticipant> = {}): ConversationParticipant =>
    ({
      id: 50,
      conversationId: 10,
      userId: RECIPIENT_ID,
      lastReadAt: null,
      lastNotifiedAt: null,
      user: { id: RECIPIENT_ID, username: 'bob', email: 'bob@example.com' } as User,
      ...overrides,
    } as ConversationParticipant);

  beforeEach(async () => {
    participantRepository = { find: jest.fn(), update: jest.fn().mockResolvedValue(undefined) };
    userRepository = { findOne: jest.fn().mockResolvedValue({ id: SENDER_ID, username: 'alice' } as User) };
    liveService = { isOnline: jest.fn().mockReturnValue(false) };
    messagingService = { shouldEmailMessageOnOffline: jest.fn().mockResolvedValue(true) };
    emailService = { sendNewMessageEmail: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageNotificationListener,
        { provide: getRepositoryToken(ConversationParticipant), useValue: participantRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: MessagingLiveService, useValue: liveService },
        { provide: MessagingService, useValue: messagingService },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    listener = module.get(MessageNotificationListener);
  });

  it('emails an offline recipient with an unread message and records the delivery marker', async () => {
    participantRepository.find.mockResolvedValue([
      buildParticipant(),
      buildParticipant({ id: 51, userId: SENDER_ID, user: { id: SENDER_ID, username: 'alice' } as User }),
    ]);

    const message = buildMessage();
    await listener.handleMessageCreated(new MessageCreatedEvent(message));

    expect(emailService.sendNewMessageEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendNewMessageEmail).toHaveBeenCalledWith(
      expect.objectContaining({ id: RECIPIENT_ID, email: 'bob@example.com' }),
      { conversationId: 10, senderName: 'alice', preview: 'Hello there' },
    );
    expect(participantRepository.update).toHaveBeenCalledWith({ id: 50 }, { lastNotifiedAt: message.createdAt });
  });

  it('never emails the sender', async () => {
    participantRepository.find.mockResolvedValue([
      buildParticipant({ id: 51, userId: SENDER_ID, user: { id: SENDER_ID, username: 'alice' } as User }),
    ]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));

    expect(emailService.sendNewMessageEmail).not.toHaveBeenCalled();
  });

  it('never emails an online recipient', async () => {
    liveService.isOnline.mockReturnValue(true);
    participantRepository.find.mockResolvedValue([buildParticipant()]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));

    expect(emailService.sendNewMessageEmail).not.toHaveBeenCalled();
    expect(participantRepository.update).not.toHaveBeenCalled();
  });

  it('never emails an opted-out recipient', async () => {
    messagingService.shouldEmailMessageOnOffline.mockResolvedValue(false);
    participantRepository.find.mockResolvedValue([buildParticipant()]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));

    expect(emailService.sendNewMessageEmail).not.toHaveBeenCalled();
    expect(participantRepository.update).not.toHaveBeenCalled();
  });

  it('does not re-send within the same unread burst (already notified, unread)', async () => {
    participantRepository.find.mockResolvedValue([
      buildParticipant({ lastNotifiedAt: new Date('2025-01-18T11:00:00.000Z'), lastReadAt: null }),
    ]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));

    expect(emailService.sendNewMessageEmail).not.toHaveBeenCalled();
  });

  it('does not re-send when notified after the last read', async () => {
    participantRepository.find.mockResolvedValue([
      buildParticipant({
        lastReadAt: new Date('2025-01-18T10:00:00.000Z'),
        lastNotifiedAt: new Date('2025-01-18T11:00:00.000Z'),
      }),
    ]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));

    expect(emailService.sendNewMessageEmail).not.toHaveBeenCalled();
  });

  it('starts a new burst once the recipient has read past the last notification', async () => {
    participantRepository.find.mockResolvedValue([
      buildParticipant({
        lastNotifiedAt: new Date('2025-01-18T10:00:00.000Z'),
        lastReadAt: new Date('2025-01-18T11:00:00.000Z'),
      }),
    ]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));

    expect(emailService.sendNewMessageEmail).toHaveBeenCalledTimes(1);
  });

  it('skips recipients without an email address', async () => {
    participantRepository.find.mockResolvedValue([
      buildParticipant({ user: { id: RECIPIENT_ID, username: 'bob', email: null } as unknown as User }),
    ]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));

    expect(emailService.sendNewMessageEmail).not.toHaveBeenCalled();
    expect(participantRepository.update).not.toHaveBeenCalled();
  });

  it('isolates per-recipient failures so other recipients still get emailed', async () => {
    const failing = buildParticipant({ id: 50, userId: RECIPIENT_ID });
    const other = buildParticipant({
      id: 52,
      userId: 3,
      user: { id: 3, username: 'carol', email: 'carol@example.com' } as User,
    });
    participantRepository.find.mockResolvedValue([failing, other]);
    emailService.sendNewMessageEmail.mockImplementation((recipient: User) => {
      if (recipient.id === RECIPIENT_ID) {
        return Promise.reject(new Error('smtp down'));
      }
      return Promise.resolve(undefined);
    });

    await expect(listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()))).resolves.toBeUndefined();

    expect(emailService.sendNewMessageEmail).toHaveBeenCalledTimes(2);
    expect(participantRepository.update).toHaveBeenCalledTimes(1);
    expect(participantRepository.update).toHaveBeenCalledWith({ id: 52 }, expect.any(Object));
  });

  it('falls back to a generic sender name when the sender is missing', async () => {
    userRepository.findOne.mockResolvedValue(null);
    participantRepository.find.mockResolvedValue([buildParticipant()]);

    await listener.handleMessageCreated(new MessageCreatedEvent(buildMessage()));

    expect(emailService.sendNewMessageEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ senderName: 'Someone' }),
    );
  });
});
