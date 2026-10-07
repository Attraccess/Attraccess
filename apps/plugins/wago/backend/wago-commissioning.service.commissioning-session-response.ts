import { WagoCommissioningSession } from './wago-commissioning-session.entity';
export type CommissioningSessionResponse = Omit<
  WagoCommissioningSession,
  'pairingCode' | 'deliveryToken' | 'initiatingPrincipal' | 'dockerProvisionToken'
> & { runtimeRecoveryAvailable?: boolean; managedAccessAvailable?: boolean; operationDeadlineAt?: string | null };
