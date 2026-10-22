import type { AuditLog } from '@attraccess/application-models';
import type { PluginAuditReceipt } from '@attraccess/plugins-backend-sdk/v2';
import { operationToken } from '../../database/transaction-scope';
export interface AuditLabelRow {
  id: number;
  label: string;
}

/** Optional current-name reads. Historical labels remain authoritative in application policy. */
export abstract class AuditLabelReader {
  abstract userNames(ids: readonly number[]): Promise<AuditLabelRow[]>;
  abstract resourceNames(ids: readonly number[]): Promise<AuditLabelRow[]>;
  abstract groupNames(ids: readonly number[]): Promise<AuditLabelRow[]>;
  abstract projectNames(ids: readonly number[]): Promise<AuditLabelRow[]>;
}

/** Explicit database filters. Policy computes the retention cutoff and page size. */
export interface AuditReadFilter {
  cutoff: Date;
  limit: number;
  domain?: string;
  action?: string;
  outcome?: string;
  operationId?: string;
  actorId?: number;
  subjectId?: number;
  subjectType?: string;
  eventPrefix?: string;
  from?: Date;
  to?: Date;
  beforeId?: number;
}
export interface LegacyAuditMetadataRow {
  legacyAuditId: unknown;
  metadata: unknown;
}
export abstract class AuditPersistence extends AuditLabelReader {
  abstract available(): boolean;
  abstract originatingTransactionActive(): boolean;
  abstract open(): Promise<void>;
  abstract close(): Promise<void>;
  abstract read(filter: AuditReadFilter): Promise<AuditLog[]>;
  abstract insert(event: Omit<AuditLog, 'id'>): Promise<void>;
  abstract hasLegacyMetadata(): Promise<boolean>;
  abstract legacyMetadata(ids: readonly number[]): Promise<LegacyAuditMetadataRow[]>;
  abstract removeExpired(cutoff: Date, withLegacyMetadata: boolean): Promise<number>;
}
/** Register one post-commit write. Rollback resolves it as unavailable. */
export interface AuditCommitBoundary {
  defer(write: () => Promise<PluginAuditReceipt>): Promise<PluginAuditReceipt>;
}
export const AUDIT_COMMIT_BOUNDARY = operationToken<AuditCommitBoundary>('audit commit boundary', ['defer']);
export abstract class AuditTransactionObserver {
  abstract start(): void;
  abstract stop(): void;
}
