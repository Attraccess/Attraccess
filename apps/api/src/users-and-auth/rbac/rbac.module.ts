import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission, Role, UserRole } from '@attraccess/database-entities';
import { RbacService } from './rbac.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserRole, Role, Permission])],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
