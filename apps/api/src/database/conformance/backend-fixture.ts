import type { AuthenticationDetail, User, UserRole } from '@attraccess/application-models';

/** Engine fixtures construct the same application services with their own implementations. */
export interface IdentityFixture {
  readonly backend: string;
  inviteIdentity(input: { username: string; email: string }): Promise<User>;
  failInvitationDelivery(fail: boolean): void;
  invitationDeliveryAttempts(): number;

  registerIdentity(input: { username: string; email: string; passwordHash: string }): Promise<{
    user: User;
    authentication: AuthenticationDetail;
  }>;
  rejectIdentityWrite(stage: 'role' | 'credential' | null): Promise<void>;
  identitySnapshot(): Promise<{ users: User[]; grants: UserRole[]; authentication: AuthenticationDetail[] }>;
  close(): Promise<void>;
}
export type IdentityFixtureFactory = () => Promise<IdentityFixture>;

/** Historical SQLite upgrades are separate from cross-engine fresh-install conformance. */
export type LegacyVersion = 'before-usage-integrity' | 'pre-refactor';
export interface UpgradeFixture {
  snapshot(): Promise<Record<string, unknown[]>>;
  upgrade(): Promise<readonly string[]>;
  interruptNextUpgrade(): void;
  durationInMinutes(): Promise<number>;
  changeLedgerAmount(amount: number): Promise<string>;
  tryRewriteAudit(): Promise<void>;
  appliedMigrations(): Promise<readonly string[]>;
  integrityViolations(): Promise<unknown[]>;
  close(): Promise<void>;
}
export type UpgradeFixtureFactory = (version: LegacyVersion) => Promise<UpgradeFixture>;

import type { AuditLog, BillingTransaction, ResourceUsage } from '@attraccess/application-models';
import type { SessionStore } from '../../users-and-auth/auth/session-store/session-store';
import type { DatabaseTransactions } from '../transaction-scope';

/** A gate is entered before acquiring a database lock. Two entered gates prove overlapping requests. */
export interface PhaseGate {
  entered: Promise<void>;
  release(): void;
}
export interface ApplicationClient {
  readonly connectionIdentity: object;
  readonly transactions: DatabaseTransactions;
  readonly sessions: SessionStore;
  hashToken(token: string): string;
  gateNextPhase(): PhaseGate;
  gateNextEffect(): PhaseGate;
  gateNextSession(): PhaseGate;
  effectCount(): number;
  notificationCount(): number;
  failEffect(fail: boolean): void;
  start(resourceId: number, userId: number, takeover?: boolean): Promise<ResourceUsage>;
  end(resourceId: number, userId: number): Promise<ResourceUsage>;
  recover(): Promise<void>;
  charge(usageId: number): Promise<BillingTransaction>;
  manual(amount: number): Promise<BillingTransaction>;
  refund(transactionId: number, amount: number): Promise<BillingTransaction>;
  recordAudit(): Promise<boolean>;
  snapshot(): Promise<{
    balances: number[];
    usages: ResourceUsage[];
    ledger: BillingTransaction[];
    audit: AuditLog[];
    attempts: number;
  }>;
}
export interface BackendFixture {
  readonly capabilities: { independentConnections: true; independentWriters: boolean; fileBacked: boolean };
  /** Every factory invocation initializes/migrates an isolated database. close removes it and all clients. */
  client(): Promise<ApplicationClient>;
  seedClosedUsage(): Promise<number>;
  rejectPublication(reject: boolean): Promise<void>;
  rejectAudit(reject: boolean): Promise<void>;
  integrityViolations(): Promise<unknown[]>;
  close(): Promise<void>;
}
/** Calling the factory again is the isolated reset/initialize/migrate operation; no state is shared across cases. */
export type BackendFixtureFactory = () => Promise<BackendFixture>;
export type ApplicationFixture = BackendFixture;
export type ApplicationFixtureFactory = BackendFixtureFactory;

export interface PluginFixture {
  install(version: 1 | 2 | 3, fail?: boolean): Promise<readonly string[]>;
  history(): Promise<readonly string[]>;
  data(): Promise<unknown[]>;
  uninstall(): Promise<number>;
  rejectUnsupported(): Promise<void>;
  close(): Promise<void>;
}
export type PluginFixtureFactory = (contract: 'legacy' | 'v2') => Promise<PluginFixture>;
