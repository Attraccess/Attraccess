import type { ResourceBillingConfigurationRecord } from '@attraccess/application-models';
import { ResourceBillingConfiguration, ResourceMeter, Setting } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { BillingConfigurationStore, ResourceRates } from '../../../billing/ports/billing-configuration.port';
import type { BillingTransactionContext } from '../../../billing/ports/billing-ledger.port';
import { isUniqueViolation } from '../../persistence-errors';
import { TransactionContextResolver } from '../transaction-context';
import { toConfigurationRecord } from './billing-mappers';

@Injectable()
export class TypeOrmBillingConfigurationStore implements BillingConfigurationStore {
  constructor(
    @InjectRepository(Setting) private readonly settings: Repository<Setting>,
    @InjectRepository(ResourceBillingConfiguration)
    private readonly configurations: Repository<ResourceBillingConfiguration>,
    private readonly contexts: TransactionContextResolver,
  ) {}

  async getCurrency(): Promise<string | null> {
    const setting = await this.settings.findOneBy({ parent: 'billing', key: 'currency' });
    return setting ? setting.value : null;
  }

  async saveCurrency(currency: string): Promise<void> {
    const existing = await this.settings.findOneBy({ parent: 'billing', key: 'currency' });
    if (existing) {
      await this.settings.update(existing.id, { value: currency });
    } else {
      await this.settings.insert({ parent: 'billing', key: 'currency', value: currency });
    }
  }

  async findResourceConfiguration(
    resourceId: number,
    context?: BillingTransactionContext,
  ): Promise<ResourceBillingConfigurationRecord | null> {
    const row = await this.contexts.manager(context).getRepository(ResourceBillingConfiguration).findOneBy({
      resourceId,
    });
    return row ? toConfigurationRecord(row) : null;
  }

  async getOrCreateResourceConfiguration(
    resourceId: number,
    context?: BillingTransactionContext,
  ): Promise<ResourceBillingConfigurationRecord> {
    const repository = this.contexts.manager(context).getRepository(ResourceBillingConfiguration);
    const existing = await repository.findOneBy({ resourceId });
    if (existing) return toConfigurationRecord(existing);
    try {
      const created = await repository.save(
        repository.create({ resourceId, creditsPerUsage: 0, creditsPerMinute: 0, creditsPerOperatingMinute: 0 }),
      );
      return toConfigurationRecord(created);
    } catch (error) {
      // A concurrent request stored the free default first; the unique resource id makes that one the answer.
      if (!isUniqueViolation(error)) throw error;
      return toConfigurationRecord(await repository.findOneByOrFail({ resourceId }));
    }
  }

  async saveResourceRates(resourceId: number, rates: ResourceRates): Promise<ResourceBillingConfigurationRecord> {
    const row = await this.configurations.findOneByOrFail({ resourceId });
    row.creditsPerUsage = rates.creditsPerUsage;
    row.creditsPerMinute = rates.creditsPerMinute;
    row.creditsPerOperatingMinute = rates.creditsPerOperatingMinute;
    return toConfigurationRecord(await this.configurations.save(row));
  }

  async hasPricedMeter(resourceId: number, context?: BillingTransactionContext): Promise<boolean> {
    const count = await this.contexts
      .manager(context)
      .count(ResourceMeter, { where: { resourceId, creditsPerUnit: MoreThan(0) } });
    return count > 0;
  }
}
