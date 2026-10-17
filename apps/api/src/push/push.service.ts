// Generic Web Push (VAPID) sender. VAPID keys live in the settings table and are
// auto-generated on first use; admins can override them (which invalidates all subscriptions).
// FEATURE: Push notification foundation
import { PushSubscription } from '@attraccess/application-models';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { PushPersistence } from './persistence/port';

import * as webpush from 'web-push';

import { PUSH_KEYS, PUSH_PARENT } from '../settings/constants';

import { SettingsStoreService } from '../settings/settings-store.service';

import { SettingsService } from '../settings/settings.service';

import { CreatePushSubscriptionDto } from './dtos/createPushSubscription.dto';

import { sendToSubscription as sendToSubscriptionImplementation } from './push-delivery';

// Generic Web Push (VAPID) sender. VAPID keys live in the settings table and are
// auto-generated on first use; admins can override them (which invalidates all subscriptions).
// FEATURE: Push notification foundation

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

export // Fallback VAPID subject when no app URL is configured. The subject is contact
// information for push-service operators, not a functional endpoint.
const DEFAULT_VAPID_SUBJECT = 'mailto:admin@localhost';

export // Uncompressed P-256 public key (0x04 prefix + 2x32 bytes) and 32-byte private scalar.
const VAPID_PUBLIC_KEY_BYTES = 65;

export const VAPID_PRIVATE_KEY_BYTES = 32;

// Fallback VAPID subject when no app URL is configured. The subject is contact
// information for push-service operators, not a functional endpoint.
// Uncompressed P-256 public key (0x04 prefix + 2x32 bytes) and 32-byte private scalar.

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  // Deduplicates concurrent key generation (e.g. several sends racing on first use).
  private vapidKeysPromise: Promise<VapidKeys> | null = null;

  constructor(
    private readonly persistence: PushPersistence,
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
    return this.persistence.countSubscriptions();
  }

  /**
   * Replaces the VAPID key pair (regenerate when no keys are given, otherwise use the provided pair).
   * All existing push subscriptions are deleted because they are bound to the old public key.
   */
  public async replaceVapidKeys(override?: VapidKeys): Promise<{ keys: VapidKeys; deletedSubscriptions: number }> {
    const keys = override ? this.validateVapidKeys(override) : (webpush.generateVAPIDKeys() as VapidKeys);

    const deletedSubscriptions = await this.persistence.removeAllSubscriptions();

    await this.persistVapidKeys(keys);
    this.vapidKeysPromise = Promise.resolve(keys);

    this.logger.warn(
      `VAPID keys ${override ? 'overridden' : 'regenerated'} - removed ${deletedSubscriptions} push subscription(s) bound to the old key`,
    );

    return { keys, deletedSubscriptions };
  }

  public async upsertSubscription(userId: number, dto: CreatePushSubscriptionDto): Promise<PushSubscription> {
    return this.persistence.registerSubscription({
      endpoint: dto.endpoint,
      userId,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: dto.userAgent,
      lastSeenAt: new Date(),
    });
  }

  public async deleteSubscription(userId: number, endpoint: string): Promise<void> {
    await this.persistence.removeOwnedSubscription(userId, endpoint);
  }

  public async sendToUser(userId: number, payload: PushNotificationPayload): Promise<void> {
    const subscriptions = await this.persistence.listUserSubscriptions(userId);
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
      this.settingsStore.getSecretSetting(PUSH_PARENT, PUSH_KEYS.vapidPrivateKey).then((secret) => secret.value),
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

  // The VAPID subject is contact information passed to the push service.
  private async getVapidSubject(): Promise<string> {
    const { from: mailFrom } = await this.settingsService.getSmtpConfiguration();
    return mailFrom ? `mailto:${mailFrom}` : DEFAULT_VAPID_SUBJECT;
  }

  private async sendToSubscription(
    subscription: PushSubscription,
    serializedPayload: string,
    vapidDetails: { subject: string; publicKey: string; privateKey: string },
  ): Promise<void> {
    const getContextOwner = () => this;
    return sendToSubscriptionImplementation(
      {
        logger: getContextOwner().logger,
        persistence: getContextOwner().persistence,
      },
      subscription,
      serializedPayload,
      vapidDetails,
    );
  }
}
