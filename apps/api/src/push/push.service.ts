// Generic Web Push (VAPID) sender. Degrades to a no-op when VAPID keys are not configured.
// FEATURE: Push notification foundation
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushSubscription } from '@attraccess/database-entities';
import * as webpush from 'web-push';
import { PushConfigType } from '../config/push.config';
import { CreatePushSubscriptionDto } from './dtos/createPushSubscription.dto';

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly config: PushConfigType;

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subscriptionRepository: Repository<PushSubscription>,
    configService: ConfigService,
  ) {
    this.config = configService.get<PushConfigType>('push') as PushConfigType;

    if (this.isEnabled) {
      webpush.setVapidDetails(
        this.config.VAPID_SUBJECT as string,
        this.config.VAPID_PUBLIC_KEY as string,
        this.config.VAPID_PRIVATE_KEY as string,
      );
    } else {
      this.logger.warn(
        'Push notifications are disabled: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are not (all) configured. ' +
          'Generate keys with "npx web-push generate-vapid-keys".',
      );
    }
  }

  public get isEnabled(): boolean {
    return this.config?.enabled ?? false;
  }

  public getPublicKey(): string | null {
    return this.isEnabled ? (this.config.VAPID_PUBLIC_KEY as string) : null;
  }

  public async upsertSubscription(userId: number, dto: CreatePushSubscriptionDto): Promise<PushSubscription> {
    // The endpoint uniquely identifies a device/browser subscription. Re-subscribing (possibly as a
    // different user on the same browser) replaces the existing entry instead of failing the unique index.
    const existing = await this.subscriptionRepository.findOne({ where: { endpoint: dto.endpoint } });
    const subscription =
      existing ??
      this.subscriptionRepository.create({
        endpoint: dto.endpoint,
      });

    subscription.userId = userId;
    subscription.p256dh = dto.keys.p256dh;
    subscription.auth = dto.keys.auth;
    subscription.userAgent = dto.userAgent ?? subscription.userAgent ?? null;
    subscription.lastSeenAt = new Date();

    return this.subscriptionRepository.save(subscription);
  }

  public async deleteSubscription(userId: number, endpoint: string): Promise<void> {
    await this.subscriptionRepository.delete({ userId, endpoint });
  }

  public async sendToUser(userId: number, payload: PushNotificationPayload): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    const subscriptions = await this.subscriptionRepository.find({ where: { userId } });
    if (subscriptions.length === 0) {
      return;
    }

    const serializedPayload = JSON.stringify(payload);

    await Promise.all(
      subscriptions.map((subscription) => this.sendToSubscription(subscription, serializedPayload)),
    );
  }

  private async sendToSubscription(subscription: PushSubscription, serializedPayload: string): Promise<void> {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        serializedPayload,
      );
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;

      // 404/410 mean the subscription is gone (browser unsubscribed / expired) - prune it.
      if (statusCode === 404 || statusCode === 410) {
        this.logger.debug(`Pruning stale push subscription ${subscription.id} (status ${statusCode})`);
        await this.subscriptionRepository.delete({ id: subscription.id });
        return;
      }

      this.logger.error(
        `Failed to send push notification to subscription ${subscription.id}: ${(error as Error).message}`,
      );
    }
  }
}
