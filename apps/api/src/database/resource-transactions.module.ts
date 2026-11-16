import { Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EntityManagerResolver } from './adapters/entity-manager-resolver';
import { resolveDatabaseBackend } from './backend';
import { unitOfWorkFor } from './adapters/shared-unit-of-work';
import { UNIT_OF_WORK } from './unit-of-work';

@Injectable()
class ResourceTransactionConnectionLifecycle implements OnModuleDestroy {
  constructor(@InjectDataSource() private readonly source: DataSource) {}

  async onModuleDestroy(): Promise<void> {
    await resolveDatabaseBackend().shutdown(this.source);
  }
}

/** The lifecycle connection's teardown, and the one unit of work every adapter of this process shares. */
@Module({
  providers: [
    ResourceTransactionConnectionLifecycle,
    {
      provide: UNIT_OF_WORK,
      inject: [DataSource],
      useFactory: (source: DataSource) => unitOfWorkFor(source),
    },
    EntityManagerResolver,
  ],
  exports: [UNIT_OF_WORK, EntityManagerResolver],
})
export class ResourceTransactionsModule {}
