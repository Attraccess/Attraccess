import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource, ResourceHealthState } from '@attraccess/database-entities';
import { ResourceHealthService } from './resource-health.service';
import { ResourceHealthController } from './resource-health.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceHealthState, Resource])],
  controllers: [ResourceHealthController],
  providers: [ResourceHealthService],
  exports: [ResourceHealthService],
})
export class ResourceHealthModule {}
