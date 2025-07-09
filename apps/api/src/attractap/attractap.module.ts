import { Module } from '@nestjs/common';
import { AttractapController } from './reader.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttractapService } from './attractap.service';
import { WebsocketService } from './modules/websockets/websocket.service';
import { AttractapGateway } from './modules/websockets/websocket.gateway';
import { AttractapNfcCardsController } from './card.controller';
import 'sqlite3';
import '@nestjs/common';
import { WebSocketEventService } from './modules/websockets/websocket-event.service';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Attractap, NFCCard } from '@attraccess/database-entities';
import { UsersAndAuthModule } from '../users-and-auth/users-and-auth.module';
import { ResourcesModule } from '../resources/resources.module';
import { ResourceUsageModule } from '../resources/usage/resourceUsage.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    TypeOrmModule.forFeature([Attractap, NFCCard]),
    UsersAndAuthModule,
    ResourcesModule,
    ResourceUsageModule,
  ],
  providers: [AttractapService, WebsocketService, AttractapGateway, WebSocketEventService],
  controllers: [AttractapController, AttractapNfcCardsController],
})
export class AttractapModule {}
