import type { RuntimeDeliveryBundle } from './wago-commissioning.service.runtime-delivery-bundle';
export interface DeliveryAttempt {
  enrollmentExpiresAt: string | null;
  credentialsTouched: boolean;
  bundle?: RuntimeDeliveryBundle;
  safeFailure: string;
}
