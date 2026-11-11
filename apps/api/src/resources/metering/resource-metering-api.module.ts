import { Module } from '@nestjs/common';
import { ResourceMeteringController } from './resource-metering.controller';
import { ResourceMeteringModule } from './resource-metering.module';
import { ResourceUsageModule } from '../usage/resourceUsage.module';

/**
 * The metering endpoints apply the usage activity-visibility rule, and usage depends on metering, so the controller
 * lives in its own module that imports both instead of making the two modules import each other.
 */
@Module({
  imports: [ResourceMeteringModule, ResourceUsageModule],
  controllers: [ResourceMeteringController],
})
export class ResourceMeteringApiModule {}
