import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role, RoleNetworkAction, UserRole } from '@attraccess/database-entities';
import { NETWORK_RESTRICTION_STORE } from '../../../network-restriction/network-restriction.port';
import { TypeOrmNetworkRestrictionStore } from './typeorm-network-restriction.store';

@Module({
  imports: [TypeOrmModule.forFeature([Role, RoleNetworkAction, UserRole])],
  providers: [{ provide: NETWORK_RESTRICTION_STORE, useClass: TypeOrmNetworkRestrictionStore }],
  exports: [NETWORK_RESTRICTION_STORE],
})
export class NetworkRestrictionPersistenceModule {}
