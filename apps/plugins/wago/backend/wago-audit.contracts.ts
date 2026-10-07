import { WAGO_AUDIT_ACTIONS } from './wago-audit.wago-audit-actions';
import type { PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';
import type { WagoAuditDetails } from './wago-audit.wago-audit-details';
import type { WagoAuditSummary } from './wago-audit.wago-audit-summary';

export type WagoAuditAction = (typeof WAGO_AUDIT_ACTIONS)[number];

export interface WagoAuditLifecycle {
  readonly operationId: string;
  attempt(): Promise<PluginAuditReceipt>;
  finish(outcome: 'succeeded' | 'failed', details?: WagoAuditDetails): Promise<PluginAuditReceipt>;
}

export interface WagoManualCommandAuditResult {
  commandId: string;
  channelId: string;
  operation: NonNullable<WagoAuditDetails['operation']>;
  result: NonNullable<WagoAuditDetails['result']>;
}

export interface WagoPresetAuditResult {
  presetId: NonNullable<WagoAuditDetails['presetId']>;
  channelId: string;
  before: WagoAuditSummary;
  after: WagoAuditSummary;
}

export interface WagoProfileAuditResult {
  /** Validated domain identity: trim-nonempty, at most 160 UTF-16 code units; preserved verbatim. */
  profileId: string;
  /** Safe integer in the persisted Modbus range 1..1000000. */
  profileVersion: number;
  before: WagoAuditSummary;
  after: WagoAuditSummary;
}
/** Integration return contracts for operations implemented by other owners. */
export interface WagoRevisionAuditResult {
  revision: number;
}
