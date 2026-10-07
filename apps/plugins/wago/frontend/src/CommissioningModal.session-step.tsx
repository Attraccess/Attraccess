import { CommissioningSession } from './api';

export function sessionStep(session: CommissioningSession | null): number {
  if (!session) return 0;
  if (session.state === 'awaiting_identity_confirmation') return 2;
  return ['awaiting_delivery', 'delivering', 'awaiting_codesys_confirmation', 'delivery_failed'].includes(session.state)
    ? 2
    : 3;
}
