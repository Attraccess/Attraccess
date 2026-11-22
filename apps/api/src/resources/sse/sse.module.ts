import { Module } from '@nestjs/common';
import { ResourceEventsService } from './resource-events.service';
import { SSEController } from './sse.controller';
import { ResourceUsageModule } from '../usage/resourceUsage.module';
import { ResourcesPersistenceModule } from '../../database/adapters/resources/resources-persistence.module';
import { ResourceListVisibilityModule } from '../visibility/resource-list-visibility.module';

@Module({
  imports: [ResourceListVisibilityModule, ResourcesPersistenceModule, ResourceUsageModule],
  controllers: [SSEController],
  providers: [ResourceEventsService],
  exports: [ResourceEventsService],
})
export class SSEModule {}
