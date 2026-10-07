import { PluginAuditReceipt } from '@attraccess/plugins-backend-sdk';
import { EntityManager, QueryRunner, TransactionCommitEvent, TransactionRollbackEvent } from 'typeorm';
import { AuditQueryStorageImplementation } from './audit-query-storage';
import { BillingTransactionAuditEvent } from './audit.service.route-context';
export abstract class AuditTransactionHooksImplementation extends AuditQueryStorageImplementation {
  /** Defers billing audit writes until the supplied transaction has committed. */
  recordBillingTransactionAfterCommit(
    event: BillingTransactionAuditEvent,
    transactionManager?: EntityManager,
  ): Promise<PluginAuditReceipt> {
    const queryRunner = transactionManager?.queryRunner;
    if (!queryRunner?.isTransactionActive) return this.recordBillingTransaction(event);
    return new Promise((resolve) => {
      const events = this.billingEvents.get(queryRunner) ?? [];
      events.push({ event, transactionDepth: this.transactionDepth(queryRunner), resolve });
      this.billingEvents.set(queryRunner, events);
    });
  }

  afterTransactionCommit({ queryRunner }: TransactionCommitEvent): void {
    // Nested transaction commits release a savepoint; wait for the owning transaction.
    if (queryRunner.isTransactionActive) {
      const transactionDepth = this.transactionDepth(queryRunner);
      for (const event of this.billingEvents.get(queryRunner) ?? []) {
        event.transactionDepth = Math.min(event.transactionDepth, transactionDepth);
      }
      return;
    }
    const events = this.billingEvents.get(queryRunner);
    if (!events) return;
    this.billingEvents.delete(queryRunner);
    for (const { event, resolve } of events) void this.recordBillingTransaction(event).then(resolve);
  }

  afterTransactionRollback({ queryRunner }: TransactionRollbackEvent): void {
    const events = this.billingEvents.get(queryRunner);
    if (!events) return;
    const transactionDepth = this.transactionDepth(queryRunner);
    const retainedEvents = events.filter((event) => event.transactionDepth <= transactionDepth);
    for (const event of events) {
      if (event.transactionDepth > transactionDepth) event.resolve({ status: 'unavailable' });
    }
    if (retainedEvents.length) this.billingEvents.set(queryRunner, retainedEvents);
    else this.billingEvents.delete(queryRunner);
  }

  protected transactionDepth(queryRunner: QueryRunner): number {
    return (queryRunner as QueryRunner & { transactionDepth: number }).transactionDepth;
  }
}
