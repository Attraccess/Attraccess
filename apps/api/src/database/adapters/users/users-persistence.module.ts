import { Module } from '@nestjs/common';
import { RBAC_STORE } from '../../../users-and-auth/rbac/rbac.port';
import { USER_STORE } from '../../../users-and-auth/users/user-store.port';
import { UnitOfWorkModule } from '../unit-of-work.module';
import { TypeOrmRbacStore } from './typeorm-rbac.store';
import { TypeOrmUserStore } from './typeorm-user.store';

@Module({
  imports: [UnitOfWorkModule],
  providers: [
    { provide: RBAC_STORE, useClass: TypeOrmRbacStore },
    { provide: USER_STORE, useClass: TypeOrmUserStore },
  ],
  exports: [RBAC_STORE, USER_STORE, UnitOfWorkModule],
})
export class UsersPersistenceModule {}
