import { AuditLog } from '@attraccess/database-entities';
import { PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';
import { Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { SettingsStoreService } from '../settings/settings-store.service';
import { AuditSettings } from './audit.config';

export const billingStatuses = new Set(['pending', 'completed', 'failed']);

export const billingSources = new Set(['manual', 'resource-usage', 'refund', 'sumup-topup', 'energy-correction']);

export const SQLITE_BUSY_TIMEOUT_MS = 10;

export const SQLITE_CONTENTION_RECOVERY_DELAY_MS = 500;

export interface BillingTransactionAuditEvent {
  transactionId: number;
  userId: number;
  initiatorId?: number | null;
  amount: number;
  status: string;
  previousStatus?: string;
  source: string;
}

export abstract class AuditServiceRouteContext {
  protected abstract readonly logger: Logger;
  protected abstract recordSnapshot(
    event: Omit<AuditLog, 'id' | 'at'>,
    finalSettingsChange?: boolean,
  ): Promise<PluginAuditReceipt>;
  public abstract recordBillingTransaction(event: BillingTransactionAuditEvent): Promise<PluginAuditReceipt>;
  protected abstract readonly billingEvents: WeakMap<
    QueryRunner,
    { event: BillingTransactionAuditEvent; transactionDepth: number; resolve: (receipt: PluginAuditReceipt) => void }[]
  >;
  protected abstract transactionDepth(queryRunner: QueryRunner): number;
  protected abstract storage?: DataSource;
  protected abstract stopping: boolean;
  protected abstract pending: number;
  protected abstract readonly settings: SettingsStoreService;
  protected abstract serializeStorageWrite<T>(write: () => Promise<T>): Promise<T>;
  protected abstract readonly source: DataSource;
  protected abstract domainEnabled(config: AuditSettings, domain: string): boolean;
  protected abstract contended: boolean;
  protected abstract writeTail: Promise<void>;
  protected abstract activeReads: number;
  protected abstract cutoff(retentionDays: number): Date;
  protected abstract hydrateLegacyPasswordPolicyDetails(items: AuditLog[]): Promise<void>;
  protected abstract hasPasswordPolicyOverflow(): Promise<boolean>;
  protected abstract cleaning: boolean;
}
