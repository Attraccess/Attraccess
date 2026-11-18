import {
  BillingTransactionStatus,
  type BillingTransactionDetail,
  type BillingTransactionRecord,
  type UsageReceiptSource,
} from '@attraccess/application-models';
import { BillingTransaction, BillingTransactionItem, User } from '@attraccess/database-entities';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { isUniqueViolation } from '../../persistence-errors';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../audit/recorder/audit-event';
import {
  BillingAuditFactory,
  BillingLedgerStore,
  BillingTransactionContext,
  NewBillingTransaction,
  SettleUsageChargeInput,
} from '../../../billing/ports/billing-ledger.port';
import { TransactionContextResolver } from '../transaction-context';
import { toTransactionDetail, toTransactionRecord, toUsageReceipt } from './billing-mappers';
import { findRelations } from '../find-options';

const DETAIL_RELATIONS = ['initiator', 'resourceUsage', 'resourceUsage.resource', 'refundOf', 'items'];

@Injectable()
export class TypeOrmBillingLedgerStore implements BillingLedgerStore {
  constructor(
    @InjectRepository(BillingTransaction) private readonly transactions: Repository<BillingTransaction>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly contexts: TransactionContextResolver,
  ) {}

  async getBalance(userId: number, context?: BillingTransactionContext): Promise<number | null> {
    const user = await this.contexts.manager(context).getRepository(User).findOneBy({ id: userId });
    return user ? user.creditBalance : null;
  }

  async findTransactionIdForUsage(usageId: number, userId: number): Promise<number | null> {
    const transaction = await this.transactions.findOne({
      where: { resourceUsageId: usageId, userId },
      select: { id: true },
    });
    return transaction?.id ?? null;
  }

  async listTransactionsForUser(
    userId: number,
    { page, limit }: { page: number; limit: number },
  ): Promise<{ transactions: BillingTransactionDetail[]; total: number }> {
    const [rows, total] = await this.transactions.findAndCount({
      where: { userId },
      skip: (page - 1) * limit,
      take: limit,
      relations: findRelations(DETAIL_RELATIONS),
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return { transactions: rows.map(toTransactionDetail), total };
  }

  async findTransactionDetail(transactionId: number, ownerId?: number): Promise<BillingTransactionDetail | null> {
    const row = await this.transactions.findOne({
      where: { id: transactionId, userId: ownerId },
      relations: findRelations(DETAIL_RELATIONS),
    });
    return row ? toTransactionDetail(row) : null;
  }

  async findTransactionWithItems(transactionId: number): Promise<BillingTransactionRecord | null> {
    const row = await this.transactions.findOne({ where: { id: transactionId }, relations: { items: true } });
    return row ? toTransactionRecord(row) : null;
  }

  async findCompletedUsageCharge(usageId: number, userId: number): Promise<BillingTransactionRecord | null> {
    const row = await this.transactions.findOneBy({
      resourceUsageId: usageId,
      userId,
      status: BillingTransactionStatus.Completed,
    });
    return row ? toTransactionRecord(row) : null;
  }

  /**
   * Inside a unit of work the usage's bill row is locked (FOR NO KEY UPDATE) until commit before it is read: two
   * settlements of one usage queue on it, and the second one reads the committed bill (and refuses to charge again)
   * instead of posting the charge or adding its items twice. A usage without a bill yet is protected by the unique
   * index on the usage reference. The user's balance is maintained by a database trigger with row level updates, so
   * it is never read and written back.
   */
  private async lockBillOfUsage(manager: EntityManager, usageId: number): Promise<void> {
    await manager
      .createQueryBuilder(BillingTransaction, 'bill')
      .select('bill.id')
      .where('bill.resourceUsageId = :usageId', { usageId })
      .setLock('for_no_key_update')
      .getMany();
  }

  async hasCompletedChargeForUsage(usageId: number, context?: BillingTransactionContext): Promise<boolean> {
    const manager = this.contexts.manager(context);
    if (context) await this.lockBillOfUsage(manager, usageId);
    const row = await manager.findOneBy(BillingTransaction, {
      resourceUsageId: usageId,
      status: BillingTransactionStatus.Completed,
    });
    return Boolean(row);
  }

  async findUsageTransaction(
    usageId: number,
    context?: BillingTransactionContext,
  ): Promise<BillingTransactionRecord | null> {
    const manager = this.contexts.manager(context);
    if (context) await this.lockBillOfUsage(manager, usageId);
    const row = await manager.findOne(BillingTransaction, {
      where: { resourceUsageId: usageId },
      relations: { items: true },
    });
    return row ? toTransactionRecord(row) : null;
  }

  async insertTransaction(
    input: NewBillingTransaction,
    options: { context?: BillingTransactionContext; audit?: BillingAuditFactory } = {},
  ): Promise<BillingTransactionRecord> {
    const manager = this.contexts.manager(options.context);
    const saved = await manager.getRepository(BillingTransaction).save({ ...input });
    if (options.audit) {
      // Inside a caller's transaction the audit row commits or rolls back with the transaction it describes.
      await this.audit.record(options.audit(saved.id), options.context);
    }
    return toTransactionRecord(saved as BillingTransaction);
  }

  settleUsageCharge(
    input: SettleUsageChargeInput,
    context?: BillingTransactionContext,
  ): Promise<BillingTransactionRecord> {
    return this.contexts.run(context, async (manager, scope) => {
      let settled: BillingTransactionRecord;
      if (input.existing) {
        await manager.update(BillingTransaction, input.existing.id, {
          amount: input.amount,
          status: BillingTransactionStatus.Completed,
        });
        settled = { ...input.existing, amount: input.amount, status: BillingTransactionStatus.Completed };
      } else {
        let saved: BillingTransaction;
        try {
          saved = await manager.save(BillingTransaction, {
            userId: input.userId,
            resourceUsageId: input.usageId,
            amount: input.amount,
            status: BillingTransactionStatus.Completed,
          } as Partial<BillingTransaction>);
        } catch (error) {
          // A concurrent settlement of the same usage won the unique index on resourceUsageId.
          if (isUniqueViolation(error)) {
            throw new BadRequestException('Billing transaction already exists for this resource usage');
          }
          throw error;
        }
        settled = toTransactionRecord(saved);
      }
      await this.audit.record(input.audit(settled.id), scope);
      for (const item of input.items) {
        await manager.save(BillingTransactionItem, { billingTransactionId: settled.id, ...item });
      }
      return settled;
    });
  }

  async findTransactionByExternalReference(reference: string): Promise<BillingTransactionRecord | null> {
    const row = await this.transactions.findOneBy({ externalReference: reference });
    return row ? toTransactionRecord(row) : null;
  }

  async listPendingTransactions(): Promise<BillingTransactionRecord[]> {
    const rows = await this.transactions.findBy({ status: BillingTransactionStatus.Pending });
    return rows.map(toTransactionRecord);
  }

  async updateTransactionStatus(
    transactionId: number,
    status: BillingTransactionStatus,
  ): Promise<BillingTransactionRecord> {
    await this.transactions.update(transactionId, { status });
    return toTransactionRecord(await this.transactions.findOneByOrFail({ id: transactionId }));
  }

  async findUsageReceipt(transactionId: number): Promise<UsageReceiptSource | null> {
    const row = await this.transactions.findOne({
      where: { id: transactionId, status: BillingTransactionStatus.Completed },
      relations: { items: true, user: true, resourceUsage: { resource: true, user: true } },
    });
    return row ? toUsageReceipt(row) : null;
  }
}
