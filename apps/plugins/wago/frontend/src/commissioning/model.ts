import { CommissioningSession } from '../api/client';

export interface CommissioningModalProps {
  isOpen: boolean;
  session: CommissioningSession | null;
  onOpenChange: (isOpen: boolean) => void;
  onConfigure?: (controllerId: number) => void;
}

export const DEFAULT_SSH = { username: 'root', password: 'wago' };

export function canInstall(session: CommissioningSession) {
  return (
    !session.runtimeRecoveryAvailable &&
    !['starting', 'started', 'recovery_required', 'recovering'].includes(session.dockerProvisionState ?? '') &&
    ['awaiting_delivery', 'delivery_failed', 'awaiting_codesys_confirmation'].includes(session.state)
  );
}

export function canRecover(session: CommissioningSession) {
  return session.runtimeRecoveryAvailable === true;
}

export function latestCommissioningSession(...candidates: Array<CommissioningSession | null | undefined>) {
  return candidates.reduce<CommissioningSession | null>((latest, candidate) => {
    if (!candidate) return latest;
    if (!latest || (Date.parse(candidate.updatedAt) || 0) > (Date.parse(latest.updatedAt) || 0)) return candidate;
    return latest;
  }, null);
}

export function parseActivityLog(auditLog: string): Array<{ at: string; event: string }> {
  try {
    const entries = JSON.parse(auditLog) as Array<{ at?: unknown; event?: unknown }>;
    return entries
      .filter(
        (entry): entry is { at: string; event: string } =>
          typeof entry.at === 'string' && typeof entry.event === 'string',
      )
      .slice(-5);
  } catch {
    return [];
  }
}

export function formatActivity(event: string): string {
  return event.replace(/^progress: /, '').replaceAll('_', ' ');
}
