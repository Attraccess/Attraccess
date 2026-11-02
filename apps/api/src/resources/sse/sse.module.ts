import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource, ResourceUsage } from '@attraccess/database-entities';
import { ResourceEventsService } from './resource-events.service';
import { SSEController } from './sse.controller';
import { ResourceUsageModule } from '../usage/resourceUsage.module';

@Module({
  imports: [TypeOrmModule.forFeature([Resource, ResourceUsage]), ResourceUsageModule],
  controllers: [SSEController],
  providers: [ResourceEventsService],
  exports: [ResourceEventsService],
})
export class SSEModule {}
