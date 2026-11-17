import { Module } from '@nestjs/common';
import { PLUGIN_PERMISSION_CATALOG_STORE } from '../../../users-and-auth/rbac/plugin-permission-catalog.port';
import { RBAC_STORE } from '../../../users-and-auth/rbac/rbac.port';
import { USER_STORE } from '../../../users-and-auth/users/user-store.port';
import { UnitOfWorkModule } from '../unit-of-work.module';
import { TypeOrmPluginPermissionCatalogStore } from './typeorm-plugin-permission-catalog.store';
import { TypeOrmRbacStore } from './typeorm-rbac.store';
import { TypeOrmUserStore } from './typeorm-user.store';

@Module({
  imports: [UnitOfWorkModule],
  providers: [
    { provide: RBAC_STORE, useClass: TypeOrmRbacStore },
    { provide: USER_STORE, useClass: TypeOrmUserStore },
    { provide: PLUGIN_PERMISSION_CATALOG_STORE, useClass: TypeOrmPluginPermissionCatalogStore },
  ],
  exports: [RBAC_STORE, USER_STORE, PLUGIN_PERMISSION_CATALOG_STORE, UnitOfWorkModule],
})
export class UsersPersistenceModule {}
