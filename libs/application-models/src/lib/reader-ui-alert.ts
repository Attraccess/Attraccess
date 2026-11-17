export type ReaderUiAlertKind = 'breaker-open' | 'load-failure' | 'crash-loop' | 'time-zone-conflict';

/**
 * Host-owned admin alert of the reader UI: an open circuit breaker, an ACCESS_HOOKS load failure, a reader crash-loop
 * suspension or plugins that disagree on a reader's time zone.
 */
export interface ReaderUiAlertRecord {
  id: number;
  kind: ReaderUiAlertKind;
  plugin: string | null;
  readerId: number | null;
  message: string;
  createdAt: Date;
  clearedAt: Date | null;
  clearedByUserId: number | null;
}
