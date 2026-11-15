import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardPin, Resource } from '@attraccess/database-entities';
import { DashboardPinsController } from './dashboard-pins.controller';
import { DashboardPinsService } from './dashboard-pins.service';

@Module({
  imports: [TypeOrmModule.forFeature([DashboardPin, Resource])],
  controllers: [DashboardPinsController],
  providers: [DashboardPinsService],
})
export class DashboardModule {}
