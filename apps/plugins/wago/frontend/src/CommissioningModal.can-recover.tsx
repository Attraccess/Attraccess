import { CommissioningSession } from './api';

export function canRecover(session: CommissioningSession) {
  return session.runtimeRecoveryAvailable === true;
}
