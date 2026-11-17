import { Module } from '@nestjs/common';
import { PersistenceCoreModule } from './adapters/common/persistence-core.module';

/**
 * The one unit of work every adapter of this process shares, and the lifecycle connection's teardown. Provided once
 * by the global PersistenceCoreModule; this module only re-exports it for the modules that name it.
 */
@Module({
  imports: [PersistenceCoreModule],
  exports: [PersistenceCoreModule],
})
export class ResourceTransactionsModule {}
