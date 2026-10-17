import {
  BillingTransaction,
  BillingTransactionStatus,
  BillingTransactionItem,
  ResourceBillingConfiguration,
  ResourceMeter,
  Setting,
  User,
} from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, MoreThan, IsNull } from 'typeorm';
import { toApplicationRecord } from '../../database/sqlite/backend';
import {
  BillingLivePersistence,
  PendingTopup,
  SumupPersistence,
  BillingPersistence,
  NewBillingTransaction,
  NewBillingItem,
} from './port';

@Injectable()
export class TypeormBillingLivePersistence extends BillingLivePersistence {
  constructor(@InjectRepository(BillingTransaction) private readonly transactions: Repository<BillingTransaction>) {
    super();
  }
  async transactionWithItems(id: number): Promise<BillingTransaction | null> {
    return toApplicationRecord(await this.transactions.findOne({ where: { id }, relations: ['items'] }));
  }
}
@Injectable()
export class TypeormSumupPersistence extends SumupPersistence {
  constructor(
    @InjectRepository(Setting) private readonly settings: Repository<Setting>,
    @InjectRepository(BillingTransaction) private readonly transactions: Repository<BillingTransaction>,
  ) {
    super();
  }
  async writeCredentials(encryptedApiKey: string, merchantCode: string): Promise<void> {
    for (const [key, value] of [
      ['apiKey', encryptedApiKey],
      ['merchantCode', merchantCode],
    ]) {
      const existing = await this.settings.findOneBy({ parent: 'sumup', key });
      if (existing) await this.settings.update(existing.id, { value });
      else await this.settings.insert({ parent: 'sumup', key, value });
    }
  }
  async apiKey(): Promise<{ value: string } | null> {
    const row = await this.settings.findOneBy({ parent: 'sumup', key: 'apiKey' });
    return row ? { value: row.value } : null;
  }
  async merchantCode(): Promise<{ value: string } | null> {
    const row = await this.settings.findOneBy({ parent: 'sumup', key: 'merchantCode' });
    return row ? { value: row.value } : null;
  }
  async transactionByReference(reference: string): Promise<BillingTransaction | null> {
    return toApplicationRecord(await this.transactions.findOneBy({ externalReference: reference }));
  }
  async saveTransaction(transaction: BillingTransaction): Promise<BillingTransaction> {
    return toApplicationRecord(await this.transactions.save(transaction));
  }
  async pendingTransactions(): Promise<BillingTransaction[]> {
    return toApplicationRecord(await this.transactions.findBy({ status: BillingTransactionStatus.Pending }));
  }
  async createTopup(transaction: PendingTopup): Promise<BillingTransaction> {
    return toApplicationRecord(await this.transactions.save(transaction));
  }
}

const LEDGER_RELATIONS = ['initiator', 'resourceUsage', 'resourceUsage.resource', 'refundOf', 'items'];
export class TypeormBillingPersistence extends BillingPersistence {
  constructor(private readonly manager: EntityManager) {
    super();
  }
  async balance(userId: number): Promise<{ creditBalance: number } | null> {
    const user = await this.manager.getRepository(User).findOneBy({ id: userId });
    return user ? { creditBalance: user.creditBalance } : null;
  }
  async transactionIdForUsage(usageId: number, userId: number): Promise<number | null> {
    const row = await this.manager
      .getRepository(BillingTransaction)
      .findOne({ where: { resourceUsageId: usageId, userId }, select: ['id'] });
    return row?.id ?? null;
  }
  async history(userId: number, skip: number, take: number): Promise<[BillingTransaction[], number]> {
    return toApplicationRecord(
      await this.manager.getRepository(BillingTransaction).findAndCount({
        where: { userId },
        skip,
        take,
        relations: LEDGER_RELATIONS,
        order: { createdAt: 'DESC', id: 'DESC' },
      }),
    );
  }
  async transaction(id: number, userId?: number): Promise<BillingTransaction | null> {
    return toApplicationRecord(
      await this.manager
        .getRepository(BillingTransaction)
        .findOne({ where: { id, userId }, relations: LEDGER_RELATIONS }),
    );
  }
  async completedUsageCharge(usageId: number, userId?: number): Promise<BillingTransaction | null> {
    return toApplicationRecord(
      await this.manager.findOneBy(BillingTransaction, {
        resourceUsageId: usageId,
        ...(userId === undefined ? {} : { userId }),
        status: BillingTransactionStatus.Completed,
      }),
    );
  }
  async createTransaction(data: NewBillingTransaction): Promise<BillingTransaction> {
    return toApplicationRecord(await this.manager.save(BillingTransaction, data));
  }
  async currency(): Promise<{ value: string } | null> {
    const value = await this.manager.getRepository(Setting).findOneBy({ parent: 'billing', key: 'currency' });
    return value ? { value: value.value } : null;
  }
  async setCurrency(value: string): Promise<void> {
    const repository = this.manager.getRepository(Setting);
    const previous = await repository.findOneBy({ parent: 'billing', key: 'currency' });
    if (previous) await repository.update(previous.id, { value });
    else await repository.insert({ parent: 'billing', key: 'currency', value });
  }
  async resourceConfiguration(resourceId: number): Promise<ResourceBillingConfiguration | null> {
    return toApplicationRecord(
      await this.manager.getRepository(ResourceBillingConfiguration).findOneBy({ resourceId }),
    );
  }
  async saveResourceConfiguration(
    data: Pick<
      ResourceBillingConfiguration,
      'resourceId' | 'creditsPerUsage' | 'creditsPerMinute' | 'creditsPerOperatingMinute'
    > &
      Partial<Pick<ResourceBillingConfiguration, 'id'>>,
  ): Promise<ResourceBillingConfiguration> {
    return toApplicationRecord(await this.manager.getRepository(ResourceBillingConfiguration).save(data));
  }
  positiveMeterCount(resourceId: number): Promise<number> {
    return this.manager.count(ResourceMeter, { where: { resourceId, creditsPerUnit: MoreThan(0) } });
  }
  async itemByExternalReference(transactionId: number, reference: string): Promise<BillingTransactionItem | null> {
    return toApplicationRecord(
      await this.manager.findOne(BillingTransactionItem, {
        where: { billingTransactionId: transactionId, externalReference: reference },
      }),
    );
  }
  itemReferenceExists(transactionId: number, reference: string): Promise<boolean> {
    return this.manager.exists(BillingTransactionItem, {
      where: { billingTransactionId: transactionId, externalReference: reference },
    });
  }
  async pendingUsageTransaction(resourceId: number, usageId: number): Promise<BillingTransaction | null> {
    return toApplicationRecord(
      await this.manager.findOne(BillingTransaction, {
        where: { resourceUsageId: usageId, resourceUsage: { resourceId }, status: BillingTransactionStatus.Pending },
      }),
    );
  }
  async matchingPendingItem(
    transactionId: number,
    item: Pick<BillingTransactionItem, 'name' | 'description' | 'externalReference' | 'unitPrice'>,
  ): Promise<BillingTransactionItem | null> {
    return toApplicationRecord(
      await this.manager.findOne(BillingTransactionItem, { where: { billingTransactionId: transactionId, ...item } }),
    );
  }
  async usageTransaction(usageId: number): Promise<BillingTransaction | null> {
    return toApplicationRecord(await this.manager.findOne(BillingTransaction, { where: { resourceUsageId: usageId } }));
  }
  async matchingItem(
    transactionId: number,
    item: Pick<BillingTransactionItem, 'name' | 'description' | 'externalReference' | 'unitPrice'>,
  ): Promise<BillingTransactionItem | null> {
    return toApplicationRecord(
      await this.manager.findOne(BillingTransactionItem, {
        where: {
          billingTransactionId: transactionId,
          ...item,
          description: item.description === null ? IsNull() : item.description,
          externalReference: item.externalReference === null ? IsNull() : item.externalReference,
        },
      }),
    );
  }
  async updateItemQuantity(itemId: number, quantity: number): Promise<void> {
    await this.manager.update(BillingTransactionItem, itemId, { quantity });
  }
  async usageTransactionWithItems(usageId: number): Promise<BillingTransaction | null> {
    return toApplicationRecord(
      await this.manager.findOne(BillingTransaction, { where: { resourceUsageId: usageId }, relations: ['items'] }),
    );
  }
  async completeTransaction(id: number, amount: number): Promise<void> {
    await this.manager.update(BillingTransaction, id, { amount, status: BillingTransactionStatus.Completed });
  }
  async saveItem(data: NewBillingItem): Promise<void> {
    await this.manager.save(BillingTransactionItem, data);
  }
  async chargeForNotification(transactionId: number): Promise<BillingTransaction | null> {
    return toApplicationRecord(
      await this.manager.getRepository(BillingTransaction).findOne({
        where: { id: transactionId, status: BillingTransactionStatus.Completed },
        relations: ['items', 'user', 'resourceUsage', 'resourceUsage.resource', 'resourceUsage.user'],
      }),
    );
  }
}
