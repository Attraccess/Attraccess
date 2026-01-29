import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Beacon, BeaconPosition, BleGateway } from '@attraccess/database-entities';
import { MqttModule } from '../../mqtt/mqtt.module';
import { PositionalTrackingController } from './positional-tracking.controller';
import { PositionalTrackingService } from './positional-tracking.service';
import { GatewayAdapterRegistry } from './gateways/gateway-adapter.registry';
import { Gls10GatewayAdapter } from './gateways/gls10-gateway.adapter';
import { ShellyGatewayAdapter } from './gateways/shelly-gateway.adapter';
import { GatewayMqttRouterService } from './mqtt/gateway-mqtt-router.service';

@Module({
  imports: [TypeOrmModule.forFeature([Beacon, BeaconPosition, BleGateway]), MqttModule],
  controllers: [PositionalTrackingController],
  providers: [
    PositionalTrackingService,
    GatewayAdapterRegistry,
    Gls10GatewayAdapter,
    ShellyGatewayAdapter,
    GatewayMqttRouterService,
  ],
  exports: [PositionalTrackingService],
})
export class PositionalTrackingModule { }
