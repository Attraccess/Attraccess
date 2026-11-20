import type { AuditRecorder } from '../../../audit/recorder/audit-event';
import type { BillingConfigurationStore } from '../../../billing/ports/billing-configuration.port';
import type { BillingLedgerStore } from '../../../billing/ports/billing-ledger.port';
import type { SumUpCredentialStore } from '../../../billing/ports/sumup-credentials.port';
import type { TokenHashService } from '../../../encryption/token-hash.service';
import type { PasskeyStore } from '../../../users-and-auth/auth/passkey/passkey.port';
import type { SessionStore } from '../../../users-and-auth/auth/session-store/session-store';
import type { UnitOfWork } from '../../unit-of-work';

/**
 * The token hash every fixture builds its SessionStore with, so the suites can name stored tokens: `h:<raw token>`.
 */
export const conformanceTokenHash = { hashToken: (token: string) => `h:${token}` } as TokenHashService;

/**
 * One independent connection to the database under test (its own pool or handle, not a promise chain on a shared
 * one) with the backend's real adapters of the application ports built on it.
 */
export interface PortConnection {
  readonly unitOfWork: UnitOfWork;
  readonly billingLedger: BillingLedgerStore;
  readonly billingConfiguration: BillingConfigurationStore;
  readonly sumUpCredentials: SumUpCredentialStore;
  /** Built with {@link conformanceTokenHash}. */
  readonly sessions: SessionStore;
  readonly passkeys: PasskeyStore;
  /** The audit recorder the billing adapters of this connection write with. */
  readonly audit: AuditRecorder;
}

/** A member who can be billed for a machine. */
export interface SeededMember {
  readonly userId: number;
  readonly resourceId: number;
}

/**
 * A fully migrated database of the backend under test. The seed and count helpers stand in for test data a later
 * suite would otherwise need a port for; they read and write committed state outside any unit of work.
 */
export interface PortDatabase {
  connect(): Promise<PortConnection>;
  /** A new user (balance 0) and a machine; `name` is unique within the database. */
  seedMember(name: string): Promise<SeededMember>;
  /**
   * A finished usage of the member: 2026-11-13 09:00 to 09:10 UTC, 2 credits per session minute, 5 per usage, no
   * operating price. Returns the usage id.
   */
  seedFinishedUsage(member: SeededMember): Promise<number>;
  /** Billing transactions of any status that reference the usage. */
  countUsageTransactions(usageId: number): Promise<number>;
  /** Billing transactions of any status of the user. */
  countUserTransactions(userId: number): Promise<number>;
  /** Stored settings rows under one parent key. */
  countSettings(parent: string): Promise<number>;
  /** The stored (hashed) tokens of the user's sessions, expired ones included, sorted. */
  sessionTokens(userId: number): Promise<string[]>;
  close(): Promise<void>;
}

/**
 * A database backend the port conformance suites run against (PostgreSQL, the only runtime database; see
 * postgres-port.test-fixture). A further backend adds a fixture; the suites stay as they are.
 */
export interface PortBackendFixture {
  /** Human readable backend name used in the test titles. */
  readonly name: string;
  /**
   * Whether two connections can hold write transactions at the same time. SQLite has one writer per file, so a
   * second writer waits for the first commit in the engine; a server database with row locks lets writers of
   * unrelated rows proceed together.
   */
  readonly concurrentWriters: boolean;
  /** A fresh, fully migrated database. Suites create one per file and keep their tests apart by their own data. */
  create(): Promise<PortDatabase>;
}
