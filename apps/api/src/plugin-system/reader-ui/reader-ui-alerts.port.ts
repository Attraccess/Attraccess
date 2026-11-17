import type { ReaderUiAlertKind, ReaderUiAlertRecord } from '@attraccess/application-models';

/** DI token of the reader UI alert store. */
export const READER_UI_ALERT_STORE = Symbol.for('attraccess.reader-ui.alert-store');

/** The scope an alert belongs to; an omitted part matches alerts without it. */
export interface ReaderUiAlertScope {
  plugin?: string;
  readerId?: number;
}

/** Host-owned admin alerts of the reader UI. An alert is open until it is cleared. */
export interface ReaderUiAlertStore {
  /** Open alerts, newest first. */
  listOpen(): Promise<ReaderUiAlertRecord[]>;
  findOpen(id: number): Promise<ReaderUiAlertRecord | null>;
  /** Open alerts of one kind and exact scope. */
  listOpenInScope(kind: ReaderUiAlertKind, scope: ReaderUiAlertScope): Promise<ReaderUiAlertRecord[]>;
  open(alert: {
    kind: ReaderUiAlertKind;
    message: string;
    plugin: string | null;
    readerId: number | null;
  }): Promise<ReaderUiAlertRecord>;
  /** Marks the alert cleared now and returns it as stored. */
  clear(id: number, clearedByUserId: number | null): Promise<ReaderUiAlertRecord>;
}
