import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Beacon, BleGateway } from '@attraccess/database-entities';
import { MqttModule } from '../../mqtt/mqtt.module';
import { PositionalTrackingService } from './positional-tracking.service';

@Module({
  imports: [TypeOrmModule.forFeature([Beacon, BleGateway]), MqttModule],
  providers: [PositionalTrackingService],
  exports: [PositionalTrackingService],
})
export class PositionalTrackingModule { }
