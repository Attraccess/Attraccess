// Generic Web Push (VAPID) sender. VAPID keys live in the settings table and are
// auto-generated on first use; admins can override them (which invalidates all subscriptions).
// FEATURE: Push notification foundation
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushSubscription } from '@attraccess/database-entities';
import * as webpush from 'web-push';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsService } from '../settings/settings.service';
import { PUSH_KEYS, PUSH_PARENT } from '../settings/constants';
import { CreatePushSubscriptionDto } from './dtos/createPushSubscription.dto';

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

// Fallback VAPID subject when no app URL is configured. The subject is contact
// information for push-service operators, not a functional endpoint.
const DEFAULT_VAPID_SUBJECT = 'mailto:admin@localhost';

// Uncompressed P-256 public key (0x04 prefix + 2x32 bytes) and 32-byte private scalar.
const VAPID_PUBLIC_KEY_BYTES = 65;
const VAPID_PRIVATE_KEY_BYTES = 32;

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  // Deduplicates concurrent key generation (e.g. several sends racing on first use).
  private vapidKeysPromise: Promise<VapidKeys> | null = null;

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subscriptionRepository: Repository<PushSubscription>,
    private readonly settingsStore: SettingsStoreService,
    private readonly settingsService: SettingsService,
  ) {}

  public async getVapidKeys(): Promise<VapidKeys> {
    if (!this.vapidKeysPromise) {
      this.vapidKeysPromise = this.loadOrGenerateVapidKeys().catch((error) => {
        // Allow a retry on the next call instead of caching the failure forever.
        this.vapidKeysPromise = null;
        throw error;
      });
    }
    return this.vapidKeysPromise;
  }

  public async getPublicKey(): Promise<string> {
    return (await this.getVapidKeys()).publicKey;
  }

  public async getSubscriptionCount(): Promise<number> {
    return this.subscriptionRepository.count();
  }

  /**
   * Replaces the VAPID key pair (regenerate when no keys are given, otherwise use the provided pair).
   * All existing push subscriptions are deleted because they are bound to the old public key.
   */
  public async replaceVapidKeys(override?: VapidKeys): Promise<{ keys: VapidKeys; deletedSubscriptions: number }> {
    const keys = override ? this.validateVapidKeys(override) : (webpush.generateVAPIDKeys() as VapidKeys);

    const deletedSubscriptions = await this.subscriptionRepository.count();
    await this.subscriptionRepository.createQueryBuilder().delete().execute();

    await this.persistVapidKeys(keys);
    this.vapidKeysPromise = Promise.resolve(keys);

    this.logger.warn(
      `VAPID keys ${override ? 'overridden' : 'regenerated'} - removed ${deletedSubscriptions} push subscription(s) bound to the old key`,
    );

    return { keys, deletedSubscriptions };
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
    const subscriptions = await this.subscriptionRepository.find({ where: { userId } });
    if (subscriptions.length === 0) {
      return;
    }

    const [keys, subject] = await Promise.all([this.getVapidKeys(), this.getVapidSubject()]);
    const vapidDetails = { subject, publicKey: keys.publicKey, privateKey: keys.privateKey };
    const serializedPayload = JSON.stringify(payload);

    await Promise.all(
      subscriptions.map((subscription) => this.sendToSubscription(subscription, serializedPayload, vapidDetails)),
    );
  }

  private async loadOrGenerateVapidKeys(): Promise<VapidKeys> {
    const [publicKey, privateKey] = await Promise.all([
      this.settingsStore.getPlainSetting(PUSH_PARENT, PUSH_KEYS.vapidPublicKey),
      this.settingsStore
        .getSecretSetting(PUSH_PARENT, PUSH_KEYS.vapidPrivateKey)
        .then((secret) => secret.value),
    ]);

    if (publicKey && privateKey) {
      return { publicKey, privateKey };
    }

    const keys = webpush.generateVAPIDKeys() as VapidKeys;
    await this.persistVapidKeys(keys);
    this.logger.log('Generated and stored a new VAPID key pair for web push notifications');
    return keys;
  }

  private async persistVapidKeys(keys: VapidKeys): Promise<void> {
    await Promise.all([
      this.settingsStore.setPlainSetting(PUSH_PARENT, PUSH_KEYS.vapidPublicKey, keys.publicKey),
      this.settingsStore.setSecretSetting(PUSH_PARENT, PUSH_KEYS.vapidPrivateKey, keys.privateKey),
    ]);
  }

  private validateVapidKeys(keys: VapidKeys): VapidKeys {
    const publicKey = keys.publicKey.trim();
    const privateKey = keys.privateKey.trim();

    if (this.base64UrlByteLength(publicKey) !== VAPID_PUBLIC_KEY_BYTES) {
      throw new BadRequestException(
        'The VAPID public key must be a base64url-encoded uncompressed P-256 public key (65 bytes)',
      );
    }
    if (this.base64UrlByteLength(privateKey) !== VAPID_PRIVATE_KEY_BYTES) {
      throw new BadRequestException('The VAPID private key must be a base64url-encoded P-256 private key (32 bytes)');
    }

    return { publicKey, privateKey };
  }

  private base64UrlByteLength(value: string): number {
    try {
      return Buffer.from(value, 'base64url').length;
    } catch {
      return -1;
    }
  }

  // The VAPID subject is contact information passed to the push service. Prefer the configured
  // app URL so operators of push services can identify this installation.
  private async getVapidSubject(): Promise<string> {
    const [publicInternetUrl, url] = await Promise.all([
      this.settingsService.getPublicInternetUrl(),
      this.settingsService.getUrl(),
    ]);
    return publicInternetUrl ?? url ?? DEFAULT_VAPID_SUBJECT;
  }

  private async sendToSubscription(
    subscription: PushSubscription,
    serializedPayload: string,
    vapidDetails: { subject: string; publicKey: string; privateKey: string },
  ): Promise<void> {
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
        { vapidDetails },
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
