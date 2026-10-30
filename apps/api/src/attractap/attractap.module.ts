import { Module } from '@nestjs/common';
import { AttractapController } from './attractap.controller';
import { ResourceAttractapsController } from './resource-attractaps.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttractapService } from './attractap.service';
import { WebsocketService } from './websockets/websocket.service';
import { AttractapGateway } from './websockets/websocket.gateway';
import { AttractapNfcCardsController } from './card.controller';
import { CardAccessService } from './card-access.service';
import 'sqlite3';
import '@nestjs/common';
import { WebSocketEventService } from './websockets/websocket-event.service';
import { ResourceListService } from './websockets/handlers/resource-list/resource-list.service';
import { ResourceActionGuard } from './websockets/handlers/resource-action.guard';
import { AttractapAuthHandler } from './websockets/handlers/auth/auth.handler';
import { AttractapFirmwareHandler } from './websockets/handlers/firmware/firmware.handler';
import { AttractapCrashReportHandler } from './websockets/handlers/crash-report/crash-report.handler';
import { AttractapCardHandler } from './websockets/handlers/card/card.handler';
import { AttractapFormsHandler } from './websockets/handlers/forms/forms.handler';
import { AttractapSessionHandler } from './websockets/handlers/session/session.handler';
import { AttractapBillingHandler } from './websockets/handlers/billing/billing.handler';
import { AttractapProjectsHandler } from './websockets/handlers/projects/projects.handler';
import { AttractapSupervisionHandler } from './websockets/handlers/supervision/supervision.handler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Attractap, AttractapCrashReport, NFCCard, Resource, User } from '@attraccess/database-entities';
import { UsersAndAuthModule } from '../users-and-auth/users-and-auth.module';
import { ResourcesModule } from '../resources/resources.module';
import { ResourceUsageModule } from '../resources/usage/resourceUsage.module';
import { AttractapFirmwareController } from './firmware.controller';
import { AttractapFirmwareService } from './firmware.service';
import { CoredumpSymbolicationService } from './coredump-symbolication.service';
import { ResourceMaintenanceModule } from '../resources/maintenances/maintenance.module';
import { ResourceHealthModule } from '../resources/health/resource-health.module';
import { LicenseModule } from '../license/license.module';
import { ResourceIntroductionsModule } from '../resources/introductions/resourceIntroductions.module';
import { ResourceIntroducersModule } from '../resources/introducers/resourceIntroducers.module';
import { ResourceGroupsModule } from '../resources/groups/resourceGroups.module';
import { ResourceFlowsModule } from '../resources/flows/resource-flows.module';
import { BillingModule } from '../billing/billing.module';
import { ProjectsModule } from '../projects/projects.module';
import { ResourceFormsModule } from '../resources/forms/forms.module';
import { SupervisionModule } from '../resources/supervision/supervision.module';
import { AttractapMassIntroductionHandler } from './websockets/handlers/mass-introduction/mass-introduction.handler';
import { MassIntroductionModule } from '../resources/mass-introductions/mass-introduction.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ResourceMeteringModule } from '../resources/metering/resource-metering.module';
import { ResourceOperatingAttributionModule } from '../resources/operating-intervals/resource-operating-attribution.module';
import { AuditModule } from '../audit/audit.module';
import { SettingsModule } from '../settings/settings.module';
import { DeviceEnrollmentModule } from '../device-enrollment/device-enrollment.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    TypeOrmModule.forFeature([Attractap, AttractapCrashReport, NFCCard, Resource, User]),
    UsersAndAuthModule,
    ResourcesModule,
    ResourceUsageModule,
    ResourceMaintenanceModule,
    ResourceHealthModule,
    LicenseModule,
    ResourceIntroductionsModule,
    ResourceIntroducersModule,
    ResourceGroupsModule,
    ResourceFlowsModule,
    BillingModule,
    ProjectsModule,
    ResourceFormsModule,
    SupervisionModule,
    MassIntroductionModule,
    NotificationsModule,
    AuditModule,
    DeviceEnrollmentModule,
    SettingsModule,
    ResourceMeteringModule,
    ResourceOperatingAttributionModule,
  ],
  providers: [
    CardAccessService,
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
    AttractapSupervisionHandler,
    AttractapMassIntroductionHandler,
  ],
  controllers: [
    AttractapController,
    AttractapNfcCardsController,
    AttractapFirmwareController,
    ResourceAttractapsController,
  ],
})
export class AttractapModule {}
