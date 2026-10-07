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
