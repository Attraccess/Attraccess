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
import {
  Attractap,
  AttractapCrashReport,
  AttractapCredentialEvent,
  AttractapInstallation,
  NFCCard,
  Resource,
  User,
} from '@attraccess/database-entities';
import { AttractapPairingController } from './pairing.controller';
import { CredentialRegistryService } from './security/credential-registry.service';
import { HandshakeLimiter } from './security/handshake-limiter';
import { InstallationIdentityService } from './security/installation-identity.service';
import { PairingService } from './security/pairing.service';
import { ReaderSessionService } from './security/reader-session.service';
import { SessionMetrics } from './security/session-metrics';
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
import { DeviceEnrollmentModule } from '../device-enrollment/device-enrollment.module';
import { SettingsModule } from '../settings/settings.module';
import { ReaderUiModule } from '../plugin-system/reader-ui/reader-ui.module';
import { AttractapUiHandler } from './websockets/handlers/ui/ui.handler';
import { CardSessionService } from './websockets/handlers/ui/card-session.service';
import { UiAuditService } from './websockets/handlers/ui/ui-audit.service';
import { UiSlotService } from './websockets/handlers/ui/ui-slot.service';
import { UiStepService } from './websockets/handlers/ui/ui-step.service';
import { ReaderStartGate } from './websockets/handlers/session/reader-start-gate.service';
import { ReaderUiAdminController } from './reader-ui-admin.controller';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    TypeOrmModule.forFeature([
      Attractap,
      AttractapCrashReport,
      AttractapCredentialEvent,
      AttractapInstallation,
      NFCCard,
      Resource,
      User,
    ]),
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
    ReaderUiModule,
  ],
  providers: [
    { provide: HandshakeLimiter, useFactory: () => new HandshakeLimiter() },
    InstallationIdentityService,
    CredentialRegistryService,
    PairingService,
    ReaderSessionService,
    SessionMetrics,
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
    CardSessionService,
    UiAuditService,
    UiStepService,
    UiSlotService,
    AttractapUiHandler,
    ReaderStartGate,
  ],
  controllers: [
    AttractapController,
    AttractapNfcCardsController,
    AttractapFirmwareController,
    ResourceAttractapsController,
    AttractapPairingController,
    ReaderUiAdminController,
  ],
})
export class AttractapModule {}
