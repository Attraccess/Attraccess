// Sends an email fallback and a browser push notification to offline conversation participants
// who have an unread message.
// FEATURE: Messaging email fallback for offline recipients
// FEATURE: Messaging push notifications for offline recipients
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationParticipant, Message, User } from '@attraccess/database-entities';
import { MessageCreatedEvent } from './events/message-created.event';
import { MessagingLiveService } from './messaging-live.service';
import { MessagingService } from './messaging.service';
import { EmailService } from '../email/email.service';
import { PushService } from '../push/push.service';

const PUSH_PREVIEW_MAX_LENGTH = 140;

@Injectable()
export class MessageNotificationListener {
  private readonly logger = new Logger(MessageNotificationListener.name);

  constructor(
    @InjectRepository(ConversationParticipant)
    private readonly participantRepository: Repository<ConversationParticipant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly liveService: MessagingLiveService,
    private readonly messagingService: MessagingService,
    private readonly emailService: EmailService,
    private readonly pushService: PushService,
  ) {}

  @OnEvent(MessageCreatedEvent.EVENT_NAME)
  async handleMessageCreated(event: MessageCreatedEvent): Promise<void> {
    const message = event.message;

    try {
      const participants = await this.participantRepository.find({
        where: { conversationId: message.conversationId },
        relations: ['user'],
      });

      const recipients = participants.filter((participant) => participant.userId !== message.senderId);
      if (recipients.length === 0) {
        return;
      }

      const sender = await this.userRepository.findOne({ where: { id: message.senderId } });
      const senderName = sender?.username ?? 'Someone';

      await Promise.all(
        recipients.map((recipient) =>
          this.notifyRecipient(recipient, message, senderName).catch((error) => {
            this.logger.error(
              `Failed to send offline message notification to user ${recipient.userId} for conversation ${message.conversationId}: ${error.message}`,
              error.stack,
            );
          }),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Failed to process message-created notification for message ${message.id}: ${error.message}`,
        error.stack,
      );
    }
  }

  private async notifyRecipient(
    participant: ConversationParticipant,
    message: Message,
    senderName: string,
  ): Promise<void> {
    // Online recipients see the message live; no notification needed.
    if (this.liveService.isOnline(participant.userId)) {
      return;
    }

    // Email debounces per unread burst; push fires per message (expected chat UX).
    await Promise.all([
      this.sendEmailFallback(participant, message, senderName),
      this.sendPushNotification(participant, message, senderName),
    ]);
  }

  private async sendEmailFallback(
    participant: ConversationParticipant,
    message: Message,
    senderName: string,
  ): Promise<void> {
    // Debounce per conversation: only one email per unread burst. If we already notified this
    // participant and they have not read the conversation since, skip until they catch up.
    if (this.alreadyNotifiedForCurrentBurst(participant)) {
      return;
    }

    // Respect the opt-out preference.
    if (!(await this.messagingService.shouldEmailMessageOnOffline(participant.userId))) {
      return;
    }

    const recipient = participant.user;
    if (!recipient?.email) {
      return;
    }

    await this.emailService.sendNewMessageEmail(recipient, {
      conversationId: message.conversationId,
      senderName,
      preview: message.content,
    });

    // Record the delivery marker so subsequent messages in this burst do not re-send.
    await this.participantRepository.update({ id: participant.id }, { lastNotifiedAt: message.createdAt });
  }

  private async sendPushNotification(
    participant: ConversationParticipant,
    message: Message,
    senderName: string,
  ): Promise<void> {
    // Respect the opt-out preference (separate toggle from email).
    if (!(await this.messagingService.shouldPushMessageOnOffline(participant.userId))) {
      return;
    }

    const preview =
      message.content.length > PUSH_PREVIEW_MAX_LENGTH
        ? `${message.content.slice(0, PUSH_PREVIEW_MAX_LENGTH).trimEnd()}…`
        : message.content;

    await this.pushService.sendToUser(participant.userId, {
      title: senderName,
      body: preview,
      url: `/messages?conversation=${message.conversationId}`,
      // One notification per conversation: newer messages replace the previous one.
      tag: `message-conversation-${message.conversationId}`,
    });
  }

  private alreadyNotifiedForCurrentBurst(participant: ConversationParticipant): boolean {
    if (!participant.lastNotifiedAt) {
      return false;
    }
    // A new burst starts once the participant reads past the last notification.
    if (!participant.lastReadAt) {
      return true;
    }
    return participant.lastNotifiedAt.getTime() > participant.lastReadAt.getTime();
  }
}
