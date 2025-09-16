import {
  BillingTransaction,
  ResourceBillingConfiguration,
  Setting,
  User,
  BillingTransactionItem,
} from '@attraccess/database-entities';
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { SumUpService } from './sumup.service';
import { LiveNotificationsService } from './liveNotificationsService';
import { ResourceFlowsModule } from '../resources/flows/resource-flows.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BillingTransaction, User, ResourceBillingConfiguration, Setting, BillingTransactionItem]),
    forwardRef(() => ResourceFlowsModule),
  ],
  controllers: [BillingController],
  providers: [BillingService, SumUpService, LiveNotificationsService],
  exports: [BillingService, SumUpService],
})
export class BillingModule {}
