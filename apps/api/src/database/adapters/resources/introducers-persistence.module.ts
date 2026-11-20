import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource, ResourceGroup, ResourceIntroducer, User } from '@attraccess/database-entities';
import { RESOURCE_INTRODUCER_STORE } from '../../../resources/introducers/resource-introducer-store.port';
import { TypeOrmResourceIntroducerStore } from './resource-introducer-store.adapter';

/** TypeORM-backed implementation of the resource introducer port. */
@Module({
  imports: [TypeOrmModule.forFeature([ResourceIntroducer, ResourceGroup, Resource, User])],
  providers: [{ provide: RESOURCE_INTRODUCER_STORE, useClass: TypeOrmResourceIntroducerStore }],
  exports: [RESOURCE_INTRODUCER_STORE],
})
export class IntroducersPersistenceModule {}
