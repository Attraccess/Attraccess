import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceMaintenance, Resource, ResourceIntroducer } from '@attraccess/database-entities';
import { ResourceMaintenanceService } from './maintenance.service';
import { ResourceMaintenanceController } from './maintenance.controller';
import { CanManageMaintenanceGuard } from './canManageMaintenance.guard';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceMaintenance, Resource, ResourceIntroducer])],
  controllers: [ResourceMaintenanceController],
  providers: [ResourceMaintenanceService, CanManageMaintenanceGuard],
  exports: [ResourceMaintenanceService],
})
export class ResourceMaintenanceModule {}
