import { Module } from '@nestjs/common';
import { PersistenceCoreModule } from './common/persistence-core.module';

/**
 * The application's single UnitOfWork (token UNIT_OF_WORK) and the resolver adapters use to join it. Provided once by
 * the global PersistenceCoreModule; this module only re-exports it for persistence modules that name it.
 */
@Module({
  imports: [PersistenceCoreModule],
  exports: [PersistenceCoreModule],
})
export class UnitOfWorkModule {}
