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
import { ResourceListService } from './websockets/handlers/resource-list.service';
import { ResourceActionGuard } from './websockets/handlers/resource-action.guard';
import { AttractapAuthHandler } from './websockets/handlers/auth.handler';
import { AttractapFirmwareHandler } from './websockets/handlers/firmware.handler';
import { AttractapCrashReportHandler } from './websockets/handlers/crash-report.handler';
import { AttractapCardHandler } from './websockets/handlers/card.handler';
import { AttractapFormsHandler } from './websockets/handlers/forms.handler';
import { AttractapSessionHandler } from './websockets/handlers/session.handler';
import { AttractapBillingHandler } from './websockets/handlers/billing.handler';
import { AttractapProjectsHandler } from './websockets/handlers/projects.handler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Attractap, AttractapCrashReport, NFCCard, Resource, User } from '@attraccess/database-entities';
import { UsersAndAuthModule } from '../users-and-auth/users-and-auth.module';
import { ResourcesModule } from '../resources/resources.module';
import { ResourceUsageModule } from '../resources/usage/resourceUsage.module';
import { AttractapFirmwareController } from './firmware.controller';
import { AttractapFirmwareService } from './firmware.service';
import { CoredumpSymbolicationService } from './coredump-symbolication.service';
import { ResourceMaintenanceModule } from '../resources/maintenances/maintenance.module';
import { LicenseModule } from '../license/license.module';
import { ResourceIntroductionsModule } from '../resources/introductions/resourceIntroductions.module';
import { ResourceIntroducersModule } from '../resources/introducers/resourceIntroducers.module';
import { ResourceFlowsModule } from '../resources/flows/resource-flows.module';
import { BillingModule } from '../billing/billing.module';
import { ProjectsModule } from '../projects/projects.module';
import { ResourceFormsModule } from '../resources/forms/forms.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    TypeOrmModule.forFeature([Attractap, AttractapCrashReport, NFCCard, Resource, User]),
    UsersAndAuthModule,
    ResourcesModule,
    ResourceUsageModule,
    ResourceMaintenanceModule,
    LicenseModule,
    ResourceIntroductionsModule,
    ResourceIntroducersModule,
    ResourceFlowsModule,
    BillingModule,
    ProjectsModule,
    ResourceFormsModule,
  ],
  providers: [
    AttractapService,
    WebsocketService,
    AttractapGateway,
    WebSocketEventService,
    AttractapFirmwareService,
    CoredumpSymbolicationService,
    ResourceListService,
    ResourceActionGuard,
    AttractapAuthHandler,
    AttractapFirmwareHandler,
    AttractapCrashReportHandler,
    AttractapCardHandler,
    AttractapFormsHandler,
    AttractapSessionHandler,
    AttractapBillingHandler,
    AttractapProjectsHandler,
  ],
  controllers: [AttractapController, AttractapNfcCardsController, AttractapFirmwareController],
})
export class AttractapModule {}
