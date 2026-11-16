import { Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { resolveDatabaseBackend } from './backend';

@Injectable()
class ResourceTransactionConnectionLifecycle implements OnModuleDestroy {
  constructor(@InjectDataSource() private readonly source: DataSource) {}

  async onModuleDestroy(): Promise<void> {
    await resolveDatabaseBackend().shutdown(this.source);
  }
}

@Module({ providers: [ResourceTransactionConnectionLifecycle] })
export class ResourceTransactionsModule {}
