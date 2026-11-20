// Generic Web Push (VAPID) sender. VAPID keys live in the settings table and are
// auto-generated on first use; admins can override them (which invalidates all subscriptions).
// FEATURE: Push notification foundation

import type { PushSubscriptionRecord } from '@attraccess/application-models';
import * as webpush from 'web-push';
import type { PushService } from './push.service';

interface PushServicePushDeliveryContext {
  logger: PushService['logger'];
  subscriptions: PushService['subscriptions'];
}
export async function sendToSubscription(
  context: PushServicePushDeliveryContext,
  subscription: PushSubscriptionRecord,
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
      context.logger.debug(`Pruning stale push subscription ${subscription.id} (status ${statusCode})`);
      await context.subscriptions.deleteById(subscription.id);
      return;
    }

    context.logger.error(
      `Failed to send push notification to subscription ${subscription.id}: ${(error as Error).message}`,
    );
  }
}
