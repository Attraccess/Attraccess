import { Setting } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SumUpCredentialStore } from '../../../billing/ports/sumup-credentials.port';
import { TransactionContextResolver } from '../transaction-context';

@Injectable()
export class TypeOrmSumUpCredentialStore implements SumUpCredentialStore {
  constructor(
    @InjectRepository(Setting) private readonly settings: Repository<Setting>,
    private readonly contexts: TransactionContextResolver,
  ) {}

  async getEncryptedApiKey(): Promise<string | null> {
    return (await this.settings.findOneBy({ parent: 'sumup', key: 'apiKey' }))?.value ?? null;
  }

  async getMerchantCode(): Promise<string | null> {
    return (await this.settings.findOneBy({ parent: 'sumup', key: 'merchantCode' }))?.value ?? null;
  }

  saveCredentials(credentials: { encryptedApiKey: string; merchantCode: string }): Promise<void> {
    return this.contexts.run(undefined, async (manager) => {
      await this.upsert(manager, 'apiKey', credentials.encryptedApiKey);
      await this.upsert(manager, 'merchantCode', credentials.merchantCode);
    });
  }

  private async upsert(manager: EntityManager, key: string, value: string): Promise<void> {
    await manager.getRepository(Setting).upsert({ parent: 'sumup', key, value }, ['parent', 'key']);
  }
}
