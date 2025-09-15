import { BillingTransaction, ResourceBillingConfiguration, Setting, User } from '@attraccess/database-entities';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { SumUpService } from './sumup.service';
import { LiveNotificationsService } from './liveNotificationsService';

@Module({
  imports: [TypeOrmModule.forFeature([BillingTransaction, User, ResourceBillingConfiguration, Setting])],
  controllers: [BillingController],
  providers: [BillingService, SumUpService, LiveNotificationsService],
  exports: [BillingService, SumUpService],
})
export class BillingModule {}
