import { Module } from '@nestjs/common';
import { RBAC_STORE } from '../../../users-and-auth/rbac/rbac.port';
import { UnitOfWorkModule } from '../unit-of-work.module';
import { TypeOrmRbacStore } from './typeorm-rbac.store';

@Module({
  imports: [UnitOfWorkModule],
  providers: [{ provide: RBAC_STORE, useClass: TypeOrmRbacStore }],
  exports: [RBAC_STORE, UnitOfWorkModule],
})
export class UsersPersistenceModule {}
