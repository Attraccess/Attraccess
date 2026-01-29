import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Beacon, BeaconPosition, BleGateway } from '@attraccess/database-entities';
import { MqttModule } from '../../mqtt/mqtt.module';
import { PositionalTrackingController } from './positional-tracking.controller';
import { PositionalTrackingService } from './positional-tracking.service';

@Module({
  imports: [TypeOrmModule.forFeature([Beacon, BeaconPosition, BleGateway]), MqttModule],
  controllers: [PositionalTrackingController],
  providers: [PositionalTrackingService],
  exports: [PositionalTrackingService],
})
export class PositionalTrackingModule { }
