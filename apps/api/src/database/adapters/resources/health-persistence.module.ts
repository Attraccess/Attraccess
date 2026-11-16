import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource, ResourceHealthState, ResourceIntroducer, User } from '@attraccess/database-entities';
import { RESOURCE_HEALTH_STORE, RESOURCE_RECIPIENT_STORE } from '../../../resources/health/resource-health-store.port';
import { TypeOrmResourceHealthStore } from './resource-health-store.adapter';
import { TypeOrmResourceRecipientStore } from './resource-recipient-store.adapter';

/** TypeORM-backed implementations of the health and resource recipient ports. */
@Module({
  imports: [TypeOrmModule.forFeature([ResourceHealthState, Resource, ResourceIntroducer, User])],
  providers: [
    { provide: RESOURCE_HEALTH_STORE, useClass: TypeOrmResourceHealthStore },
    { provide: RESOURCE_RECIPIENT_STORE, useClass: TypeOrmResourceRecipientStore },
  ],
  exports: [RESOURCE_HEALTH_STORE, RESOURCE_RECIPIENT_STORE],
})
export class HealthPersistenceModule {}
