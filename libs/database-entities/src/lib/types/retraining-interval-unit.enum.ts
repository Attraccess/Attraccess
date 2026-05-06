// New enum for retraining-only intervals (DAYS..YEARS) distinct from
// FEATURE: User retraining requirement (ATT-106)
export enum RetrainingIntervalUnit {
  DAYS = 'DAYS',
  WEEKS = 'WEEKS',
  MONTHS = 'MONTHS',
  YEARS = 'YEARS',
}
