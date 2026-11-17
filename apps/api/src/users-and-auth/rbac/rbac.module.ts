import { Module } from '@nestjs/common';
import { UsersPersistenceModule } from '../../database/adapters/users/users-persistence.module';
import { RbacService } from './rbac.service';

@Module({
  imports: [UsersPersistenceModule],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
