import { CommissioningSession } from './api';

export function canInstall(session: CommissioningSession) {
  return (
    !session.runtimeRecoveryAvailable &&
    !['starting', 'started', 'recovery_required', 'recovering'].includes(session.dockerProvisionState ?? '') &&
    ['awaiting_delivery', 'delivery_failed', 'awaiting_codesys_confirmation'].includes(session.state)
  );
}
