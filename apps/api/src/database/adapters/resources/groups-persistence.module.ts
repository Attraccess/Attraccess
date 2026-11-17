import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Resource,
  ResourceGroup,
  ResourceIntroducer,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
} from '@attraccess/database-entities';
import {
  RESOURCE_GROUP_INTRODUCER_STORE,
  RESOURCE_GROUP_STORE,
} from '../../../resources/groups/resource-group-store.port';
import { TypeOrmResourceGroupIntroducerStore, TypeOrmResourceGroupStore } from './resource-group-store.adapter';
import { IntroductionsPersistenceModule } from './introductions-persistence.module';

/** TypeORM-backed implementations of the resource group ports. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Resource,
      ResourceGroup,
      ResourceIntroduction,
      ResourceIntroductionHistoryItem,
      ResourceIntroducer,
    ]),
    IntroductionsPersistenceModule,
  ],
  providers: [
    { provide: RESOURCE_GROUP_STORE, useClass: TypeOrmResourceGroupStore },
    { provide: RESOURCE_GROUP_INTRODUCER_STORE, useClass: TypeOrmResourceGroupIntroducerStore },
  ],
  exports: [RESOURCE_GROUP_STORE, RESOURCE_GROUP_INTRODUCER_STORE, IntroductionsPersistenceModule],
})
export class GroupsPersistenceModule {}
