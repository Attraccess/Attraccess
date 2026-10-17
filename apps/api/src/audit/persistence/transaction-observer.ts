import type { PluginAuditReceipt } from '@attraccess/plugins-backend-sdk/v2';
import type {
  DataSource,
  EntityManager,
  EntitySubscriberInterface,
  QueryRunner,
  TransactionCommitEvent,
  TransactionRollbackEvent,
} from 'typeorm';
import { AuditCommitBoundary, AuditTransactionObserver } from './port';

interface PendingWrite {
  write: () => Promise<PluginAuditReceipt>;
  transactionDepth: number;
  resolve: (receipt: PluginAuditReceipt) => void;
}
/** QueryRunner/savepoint details stay inside the SQLite implementation. */
export class SqliteAuditTransactionObserver extends AuditTransactionObserver implements EntitySubscriberInterface {
  private subscribed = false;
  private readonly pending = new WeakMap<QueryRunner, PendingWrite[]>();
  constructor(private readonly source: DataSource) {
    super();
  }
  start(): void {
    if (this.subscribed) return;
    this.source.subscribers.push(this);
    this.subscribed = true;
  }
  stop(): void {
    if (!this.subscribed) return;
    const index = this.source.subscribers.indexOf(this);
    if (index >= 0) this.source.subscribers.splice(index, 1);
    this.subscribed = false;
  }
  bind(manager: EntityManager): AuditCommitBoundary {
    return {
      defer: (write) => {
        const runner = manager.queryRunner;
        if (!runner?.isTransactionActive) return write();
        return new Promise((resolve) => {
          const events = this.pending.get(runner) ?? [];
          events.push({ write, transactionDepth: this.depth(runner), resolve });
          this.pending.set(runner, events);
        });
      },
    };
  }
  afterTransactionCommit({ queryRunner }: TransactionCommitEvent): void {
    if (queryRunner.isTransactionActive) {
      for (const event of this.pending.get(queryRunner) ?? [])
        event.transactionDepth = Math.min(event.transactionDepth, this.depth(queryRunner));
      return;
    }
    const events = this.pending.get(queryRunner);
    if (!events) return;
    this.pending.delete(queryRunner);
    for (const { write, resolve } of events) void write().then(resolve, () => resolve({ status: 'unavailable' }));
  }
  afterTransactionRollback({ queryRunner }: TransactionRollbackEvent): void {
    const events = this.pending.get(queryRunner);
    if (!events) return;
    const depth = this.depth(queryRunner);
    const retained = events.filter((event) => event.transactionDepth <= depth);
    for (const event of events) if (event.transactionDepth > depth) event.resolve({ status: 'unavailable' });
    if (retained.length) this.pending.set(queryRunner, retained);
    else this.pending.delete(queryRunner);
  }
  private depth(runner: QueryRunner): number {
    return (runner as QueryRunner & { transactionDepth: number }).transactionDepth;
  }
}

/** Composition helper for existing SQLite transaction fixtures and implementation callers. */
export function sqliteAuditCommitBoundary(manager?: EntityManager): AuditCommitBoundary | undefined {
  if (!manager?.queryRunner?.isTransactionActive) return undefined;
  const observer = manager.connection.subscribers.find((entry) => entry instanceof SqliteAuditTransactionObserver);
  if (!(observer instanceof SqliteAuditTransactionObserver))
    throw new Error('Audit transaction observer is not registered');
  return observer.bind(manager);
}
