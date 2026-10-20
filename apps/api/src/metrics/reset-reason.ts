const RESET_REASONS = new Set([
  'POWERON',
  'EXT',
  'SW',
  'PANIC',
  'INT_WDT',
  'TASK_WDT',
  'WDT',
  'DEEPSLEEP',
  'BROWNOUT',
  'SDIO',
  'UNKNOWN',
]);

export function normalizeResetReason(resetReason?: string | null): string {
  return typeof resetReason === 'string' && RESET_REASONS.has(resetReason) ? resetReason : 'UNKNOWN';
}
