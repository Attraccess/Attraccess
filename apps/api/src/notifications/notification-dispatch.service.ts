import { Injectable, Logger } from '@nestjs/common';
import { ResourceHealthStatus, User } from '@attraccess/database-entities';
import { PushService } from '../push/push.service';
import { EmailService } from '../email/email.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationLiveService } from './notification-live.service';
import { NotificationCategory, NotificationChannel } from './notification-types';

export interface NotificationDispatchRequest {
  category: NotificationCategory;
  recipients: User[];
  channels?: NotificationChannel[];
  title: string;
  body: string;
  url?: string;
  actorId?: number;
  severity?: 'info' | 'warning';
  dedupeKey?: string;
  sendEmail?: (recipient: User) => Promise<void>;
}

@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly preferences: NotificationPreferenceService,
    private readonly pushService: PushService,
    private readonly liveService: NotificationLiveService,
    private readonly emailService: EmailService,
  ) {}

  public async dispatch(request: NotificationDispatchRequest): Promise<void> {
    await Promise.all(
      request.recipients
        .filter((recipient) => recipient.id !== request.actorId)
        .map((recipient) => this.dispatchToRecipient(request, recipient)),
    );
  }

  private async dispatchToRecipient(request: NotificationDispatchRequest, recipient: User): Promise<void> {
    const channels = request.channels ?? [
      NotificationChannel.EMAIL,
      NotificationChannel.PUSH,
      NotificationChannel.TOAST,
    ];
    const [emailEnabled, pushEnabled, toastEnabled] = await Promise.all([
      channels.includes(NotificationChannel.EMAIL)
        ? this.preferences.isChannelEnabled(recipient.id, request.category, NotificationChannel.EMAIL)
        : Promise.resolve(false),
      channels.includes(NotificationChannel.PUSH)
        ? this.preferences.isChannelEnabled(recipient.id, request.category, NotificationChannel.PUSH)
        : Promise.resolve(false),
      channels.includes(NotificationChannel.TOAST)
        ? this.preferences.isChannelEnabled(recipient.id, request.category, NotificationChannel.TOAST)
        : Promise.resolve(false),
    ]);

    await Promise.all([
      emailEnabled && request.sendEmail ? this.tryEmail(request, recipient) : Promise.resolve(),
      pushEnabled ? this.tryPush(request, recipient) : Promise.resolve(),
      toastEnabled ? this.tryToast(request, recipient) : Promise.resolve(),
    ]);
  }

  private async tryEmail(request: NotificationDispatchRequest, recipient: User): Promise<void> {
    try {
      await request.sendEmail?.(recipient);
    } catch (error) {
      this.logger.error(
        `Failed to send ${request.category} email to user ${recipient.id}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  private async tryPush(request: NotificationDispatchRequest, recipient: User): Promise<void> {
    await this.pushService.sendToUser(recipient.id, {
      title: request.title,
      body: request.body,
      url: request.url,
      tag: request.dedupeKey ?? request.category,
    });
  }

  private async tryToast(request: NotificationDispatchRequest, recipient: User): Promise<void> {
    this.liveService.emitToUser(recipient.id, {
      category: request.category,
      title: request.title,
      body: request.body,
      url: request.url,
      severity: request.severity ?? 'info',
    });
  }

  public async sendEmailTemplate(
    recipient: User,
    category: NotificationCategory,
    context: Record<string, unknown>,
  ): Promise<void> {
    if (category === NotificationCategory.MAINTENANCE_REQUESTS) {
      await this.emailService.sendMaintenanceRequestedEmail(
        recipient,
        context.resource as { id: number; name: string },
        context.request as { id: number; reason: string; requestedBy: string },
      );
      return;
    }

    if (category === NotificationCategory.RESOURCE_USAGE_NOTES) {
      await this.emailService.sendResourceUsageNoteEmail(
        recipient,
        context.resource as { id: number; name: string },
        context.note as { content: string; phase: 'start' | 'end'; authorName: string },
      );
      return;
    }

    if (category === NotificationCategory.RESOURCE_HEALTH) {
      await this.emailService.sendResourceHealthChangedEmail(
        recipient,
        context.resource as { id: number; name: string },
        context.health as {
          status: ResourceHealthStatus;
          previousStatus: ResourceHealthStatus | null;
          reason: string | null;
          identifier: string;
        },
      );
      return;
    }

    if (category === NotificationCategory.RESOURCE_TAKEOVER) {
      await this.emailService.sendResourceTakeoverEmail(
        recipient,
        context.resource as { id: number; name: string },
        context.takeover as { actorName: string },
      );
      return;
    }

    if (category === NotificationCategory.MESSAGES) {
      await this.emailService.sendNewMessageEmail(
        recipient,
        context.message as { conversationId: number; senderName: string; preview: string },
      );
    }
  }
}
