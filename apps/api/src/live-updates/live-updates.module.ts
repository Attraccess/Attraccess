import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from '@attraccess/database-entities';
import { SSEModule } from '../resources/sse/sse.module';
import { ResourceFlowsModule } from '../resources/flows/resource-flows.module';
import { SupervisionModule } from '../resources/supervision/supervision.module';
import { BillingModule } from '../billing/billing.module';
import { MessagingModule } from '../messaging/messaging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LiveUpdatesController } from './live-updates.controller';
import { LiveUpdatesService } from './live-updates.service';
import { LiveTopicsService } from './live-topics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Resource]),
    SSEModule,
    ResourceFlowsModule,
    SupervisionModule,
    BillingModule,
    MessagingModule,
    NotificationsModule,
  ],
  controllers: [LiveUpdatesController],
  providers: [LiveUpdatesService, LiveTopicsService],
})
export class LiveUpdatesModule {}
