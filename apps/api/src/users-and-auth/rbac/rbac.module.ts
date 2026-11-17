import { Module } from '@nestjs/common';
import { UsersPersistenceModule } from '../../database/adapters/users/users-persistence.module';
import { PluginPermissionSyncService } from './plugin-permission-sync.service';
import { RbacService } from './rbac.service';

@Module({
  imports: [UsersPersistenceModule],
  providers: [RbacService, PluginPermissionSyncService],
  exports: [RbacService],
})
export class RbacModule {}
