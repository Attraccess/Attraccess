import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource, ResourceFlowEdge, ResourceFlowNode, ResourceUsage } from '@attraccess/database-entities';
import { RESOURCE_STORE } from '../../../resources/resource-store.port';
import { TypeOrmResourceStore } from './resource-store.adapter';

/** TypeORM-backed implementation of the resource port. */
@Module({
  imports: [TypeOrmModule.forFeature([Resource, ResourceUsage, ResourceFlowNode, ResourceFlowEdge])],
  providers: [{ provide: RESOURCE_STORE, useClass: TypeOrmResourceStore }],
  exports: [RESOURCE_STORE],
})
export class ResourcesPersistenceModule {}
