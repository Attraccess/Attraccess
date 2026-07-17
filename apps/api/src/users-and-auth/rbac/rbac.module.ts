import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission, Role, RolePermission, User, UserRole } from '@attraccess/database-entities';
import { RbacService } from './rbac.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserRole, Role, Permission, User, RolePermission])],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
