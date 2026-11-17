import type { WagoCommissioningSessionRow } from '../../domain-storage';

export type WagoCommissioningState =
  | 'awaiting_delivery'
  | 'delivering'
  | 'awaiting_identity_confirmation'
  | 'awaiting_codesys_confirmation'
  | 'delivery_failed'
  | 'awaiting_discovery'
  | 'awaiting_claim'
  | 'awaiting_verification'
  | 'claim_interrupted'
  | 'recovery_revocation_pending'
  | 'completed'
  | 'revoked';

/** Row of the commissioning session table; `state` is always a {@link WagoCommissioningState}. */
export type WagoCommissioningSession = WagoCommissioningSessionRow;
