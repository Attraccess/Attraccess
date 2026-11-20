import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { resolveDatabaseBackend } from '../../backend';
import { UNIT_OF_WORK } from '../../unit-of-work';
import { EntityManagerResolver } from '../entity-manager-resolver';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { TransactionContextResolver } from '../transaction-context';
import { TransactionHandles } from './transaction-handles';

/** Releases the connections the backend opened beside the application connection. */
@Injectable()
class BackendConnectionsLifecycle implements OnModuleDestroy {
  constructor(@Inject(getDataSourceToken()) private readonly source: DataSource) {}

  async onModuleDestroy(): Promise<void> {
    await resolveDatabaseBackend().shutdown(this.source);
  }
}

/**
 * The only provider of the application's unit of work (token UNIT_OF_WORK) and of the adapters' access to the
 * transaction behind a scope. Global: imported once by DatabaseConnectionModule, every persistence module of an area
 * relies on it. UnitOfWorkModule and ResourceTransactionsModule only re-export it.
 */
@Global()
@Module({
  providers: [
    {
      provide: UNIT_OF_WORK,
      inject: [getDataSourceToken()],
      // One instance per connection: scopes only work with the unit of work that opened them.
      useFactory: (source: DataSource) => unitOfWorkFor(source),
    },
    BackendConnectionsLifecycle,
    TransactionHandles,
    TransactionContextResolver,
    EntityManagerResolver,
  ],
  exports: [UNIT_OF_WORK, TransactionHandles, TransactionContextResolver, EntityManagerResolver],
})
export class PersistenceCoreModule {}
