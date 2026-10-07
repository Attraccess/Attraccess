import { CommissioningSession } from './api';

export function latestCommissioningSession(...candidates: Array<CommissioningSession | null | undefined>) {
  return candidates.reduce<CommissioningSession | null>((latest, candidate) => {
    if (!candidate) return latest;
    if (!latest || (Date.parse(candidate.updatedAt) || 0) > (Date.parse(latest.updatedAt) || 0)) return candidate;
    return latest;
  }, null);
}
