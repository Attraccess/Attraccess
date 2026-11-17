import { Module } from '@nestjs/common';
import { SystemPersistenceModule } from '../database/adapters/system/system-persistence.module';
import { VersionController } from './version.controller';
import { VersionService } from './version.service';

@Module({
  imports: [SystemPersistenceModule],
  controllers: [VersionController],
  providers: [VersionService],
  exports: [VersionService],
})
export class VersionModule {}
