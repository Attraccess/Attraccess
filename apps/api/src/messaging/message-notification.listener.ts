// Sends configurable message notifications to conversation participants.
// FEATURE: Messaging email fallback for offline recipients
// FEATURE: Messaging push notifications for offline recipients
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MessageRecord, NotificationRecipient } from '@attraccess/application-models';
import { MessageCreatedEvent } from './events/message-created.event';
import { MessagingLiveService } from './messaging-live.service';
import {
  MESSAGE_NOTIFICATION_STORE,
  MessageNotificationStore,
  NotifiableParticipant,
} from './message-notification-store.port';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { NotificationCategory, NotificationChannel } from '../notifications/notification-types';

const PUSH_PREVIEW_MAX_LENGTH = 140;

@Injectable()
export class MessageNotificationListener {
  private readonly logger = new Logger(MessageNotificationListener.name);

  constructor(
    @Inject(MESSAGE_NOTIFICATION_STORE)
    private readonly store: MessageNotificationStore,
    private readonly liveService: MessagingLiveService,
    private readonly notifications: NotificationDispatchService,
  ) {}

  @OnEvent(MessageCreatedEvent.EVENT_NAME)
  async handleMessageCreated(event: MessageCreatedEvent): Promise<void> {
    const message = event.message;

    try {
      const participants = await this.store.findParticipants(message.conversationId);

      const recipients = participants.filter((participant) => participant.userId !== message.senderId);
      if (recipients.length === 0) {
        return;
      }

      const senderName = (await this.store.findDisplayName(message.senderId)) ?? 'Someone';

      await this.dispatchToast(recipients, message, senderName);

      const offlineRecipients = recipients.filter((recipient) => !this.liveService.isOnline(recipient.userId));
      await Promise.all(
        offlineRecipients.map((recipient) =>
          this.dispatchOfflineNotification(recipient, message, senderName).catch((error) => {
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

  private async dispatchToast(
    participants: NotifiableParticipant[],
    message: MessageRecord,
    senderName: string,
  ): Promise<void> {
    const recipients = participants
      .map((participant) => participant.recipient)
      .filter((user): user is NotificationRecipient => Boolean(user));
    if (recipients.length === 0) {
      return;
    }

    await this.notifications.dispatch({
      category: NotificationCategory.MESSAGES,
      recipients,
      actorId: message.senderId,
      channels: [NotificationChannel.TOAST],
      title: senderName,
      body: message.content,
      url: `/messages?conversation=${message.conversationId}`,
      dedupeKey: `message-conversation-${message.conversationId}`,
    });
  }

  private async dispatchOfflineNotification(
    participant: NotifiableParticipant,
    message: MessageRecord,
    senderName: string,
  ): Promise<void> {
    const recipient = participant.recipient;
    if (!recipient) {
      return;
    }

    const preview = this.truncatePreview(message.content);

    await this.notifications.dispatch({
      category: NotificationCategory.MESSAGES,
      recipients: [recipient],
      actorId: message.senderId,
      channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
      title: senderName,
      body: preview,
      url: `/messages?conversation=${message.conversationId}`,
      dedupeKey: `message-conversation-${message.conversationId}`,
      sendEmail: async (emailRecipient) => this.sendEmailFallback(participant, message, senderName, emailRecipient),
    });
  }

  private async sendEmailFallback(
    participant: NotifiableParticipant,
    message: MessageRecord,
    senderName: string,
    recipient: NotificationRecipient,
  ): Promise<void> {
    // Debounce per conversation: only one email per unread burst. If we already notified this
    // participant and they have not read the conversation since, skip until they catch up.
    if (this.alreadyNotifiedForCurrentBurst(participant) || !recipient.email) {
      return;
    }

    await this.notifications.sendEmailTemplate(recipient, NotificationCategory.MESSAGES, {
      message: {
        conversationId: message.conversationId,
        senderName,
        preview: message.content,
      },
    });

    // Record the delivery marker so subsequent messages in this burst do not re-send.
    await this.store.markNotified(participant.participantId, message.createdAt);
  }

  private truncatePreview(content: string): string {
    return content.length > PUSH_PREVIEW_MAX_LENGTH
      ? `${content.slice(0, PUSH_PREVIEW_MAX_LENGTH).trimEnd()}…`
      : content;
  }

  private alreadyNotifiedForCurrentBurst(participant: NotifiableParticipant): boolean {
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
