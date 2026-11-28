import { Module } from '@nestjs/common';
import { DashboardPersistenceModule } from '../database/adapters/dashboard/dashboard-persistence.module';
import { DashboardPinsController } from './dashboard-pins.controller';
import { ResourceListVisibilityModule } from '../resources/visibility/resource-list-visibility.module';
import { DashboardPinsService } from './dashboard-pins.service';

@Module({
  imports: [DashboardPersistenceModule, ResourceListVisibilityModule],
  controllers: [DashboardPinsController],
  providers: [DashboardPinsService],
})
export class DashboardModule {}
