import { Module } from '@nestjs/common';
import { AttractapController } from './attractap.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttractapService } from './attractap.service';
import { WebsocketService } from './websockets/websocket.service';
import { AttractapGateway } from './websockets/websocket.gateway';
import { AttractapNfcCardsController } from './card.controller';
import 'sqlite3';
import '@nestjs/common';
import { WebSocketEventService } from './websockets/websocket-event.service';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Attractap, NFCCard, Resource, User } from '@attraccess/database-entities';
import { UsersAndAuthModule } from '../users-and-auth/users-and-auth.module';
import { ResourcesModule } from '../resources/resources.module';
import { ResourceUsageModule } from '../resources/usage/resourceUsage.module';
import { AttractapFirmwareController } from './firmware.controller';
import { AttractapFirmwareService } from './firmware.service';
import { ResourceMaintenanceModule } from '../resources/maintenances/maintenance.module';
import { LicenseModule } from '../license/license.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    TypeOrmModule.forFeature([Attractap, NFCCard, Resource, User]),
    UsersAndAuthModule,
    ResourcesModule,
    ResourceUsageModule,
    ResourceMaintenanceModule,
    LicenseModule,
  ],
  providers: [AttractapService, WebsocketService, AttractapGateway, WebSocketEventService, AttractapFirmwareService],
  controllers: [AttractapController, AttractapNfcCardsController, AttractapFirmwareController],
})
export class AttractapModule {}
