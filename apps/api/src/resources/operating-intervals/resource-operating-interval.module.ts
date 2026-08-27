import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceOperatingInterval } from '@attraccess/database-entities';
import { ResourceOperatingIntervalService } from './resource-operating-interval.service';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceOperatingInterval])],
  providers: [ResourceOperatingIntervalService],
  exports: [ResourceOperatingIntervalService],
})
export class ResourceOperatingIntervalModule {}
