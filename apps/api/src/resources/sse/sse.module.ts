import { ResourceActivityGuard } from '../activity/resource-activity.guard';
import { ResourceActivityPolicyModule } from '../activity/resource-activity-policy.module';
import { UsersAndAuthModule } from '../../users-and-auth/users-and-auth.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from '@attraccess/database-entities';
import { ResourceEventsService } from './resource-events.service';
import { SSEController } from './sse.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Resource]), ResourceActivityPolicyModule, UsersAndAuthModule],
  controllers: [SSEController],
  providers: [ResourceEventsService, ResourceActivityGuard],
  exports: [ResourceEventsService],
})
export class SSEModule {}
