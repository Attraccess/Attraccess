export interface RetrainingPolicy {
  retrainingMaxAgeDays: number | null;
  retrainingMaxInactivityDays: number | null;
  retrainingBlocksAccess: boolean;
}

export type RetrainingReason = 'age' | 'inactivity' | null;

export interface RetrainingEvaluation {
  applies: boolean;
  isDue: boolean;
  blocksAccess: boolean;
  dueAt: Date | null;
  reason: RetrainingReason;
}

export interface ResourceRetrainingStatus extends RetrainingEvaluation {
  hasIntroduction: boolean;
}
export const DAY_MS = 24 * 60 * 60 * 1000;
export const EMPTY_EVALUATION: RetrainingEvaluation = {
  applies: false,
  isDue: false,
  blocksAccess: false,
  dueAt: null,
  reason: null,
};
