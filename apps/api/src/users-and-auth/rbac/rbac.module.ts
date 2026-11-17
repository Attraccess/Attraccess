import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission, Role, RolePermission, User, UserRole } from '@attraccess/database-entities';
import { PluginPermissionSyncService } from './plugin-permission-sync.service';
import { RbacService } from './rbac.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserRole, Role, Permission, User, RolePermission])],
  providers: [RbacService, PluginPermissionSyncService],
  exports: [RbacService],
})
export class RbacModule {}
