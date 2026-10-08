import type { RuntimeDeliveryBundle } from './model';
export interface DeliveryAttempt {
  enrollmentExpiresAt: string | null;
  credentialsTouched: boolean;
  bundle?: RuntimeDeliveryBundle;
  safeFailure: string;
}
