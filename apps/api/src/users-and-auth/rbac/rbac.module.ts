import { SqliteTransactionDriver } from '../../database/sqlite/transactions';
import { RBAC_WRITES, RbacPersistence } from './persistence/port';
import { TypeormRbacPersistence, rbacTransactionOperations } from './persistence/typeorm-adapter';
import { Repository } from 'typeorm';
import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Permission, Role, RolePermission, User, UserRole } from '@attraccess/database-entities';
import { RbacService } from './rbac.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserRole, Role, Permission, User, RolePermission])],
  providers: [
    RbacService,
    {
      provide: RbacPersistence,
      useFactory: (
        driver: SqliteTransactionDriver,
        grants: Repository<UserRole>,
        roles: Repository<Role>,
        permissions: Repository<Permission>,
        users: Repository<User>,
        rolePermissions: Repository<RolePermission>,
      ) => {
        driver.register(RBAC_WRITES, rbacTransactionOperations);
        return new TypeormRbacPersistence(grants, roles, permissions, users, rolePermissions);
      },
      inject: [
        SqliteTransactionDriver,
        getRepositoryToken(UserRole),
        getRepositoryToken(Role),
        getRepositoryToken(Permission),
        getRepositoryToken(User),
        getRepositoryToken(RolePermission),
      ],
    },
  ],
  exports: [RbacService],
})
export class RbacModule {}
