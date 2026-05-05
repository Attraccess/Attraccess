import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource, ResourceHealthState } from '@attraccess/database-entities';
import { ResourceHealthService } from './resource-health.service';
import { ResourceHealthController } from './resource-health.controller';
import { ResourceMaintenanceModule } from '../maintenances/maintenance.module';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceHealthState, Resource]), ResourceMaintenanceModule],
  controllers: [ResourceHealthController],
  providers: [ResourceHealthService],
  exports: [ResourceHealthService],
})
export class ResourceHealthModule {}
