// Reservations plugin — backend half. Users reserve a resource for a time window; the plugin never
// terminates or takes over sessions. This file wires the Nest module; logic lives in services.
//
// Single API instance assumed: the settings cache, the per-resource creation mutex, the scheduler and
// the pending-decision store are in-process. Distributed lock, cross-instance booking lock and cache invalidation are
// tracked in ATT-1146.
import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk';
import { DynamicModule } from '@nestjs/common';
import { ReservationSettingsController } from './api/settings.controller';
import { ReservationEventHandlers } from './events/event-handlers.service';
import { PendingDecisionService } from './hooks/pending-decision.service';
import { PendingDecisionStore } from './hooks/pending-decisions';
import { PreStartService } from './hooks/pre-start.service';
import { HookServicePublisher } from './hooks/publisher';
import { preStartHook, readerUiProvider, sessionEndHook, startBlockedQuery, startCapacityHook } from './hooks/runtime';
import { StartCapacityService } from './hooks/start-capacity.service';
import { ReaderUiService } from './reader-ui/reader-ui.service';
import { SessionEndService } from './hooks/session-end.service';
import { IcalFeedsController, IcalPublicController } from './ical/ical.controller';
import { IcalService } from './ical/ical.service';
import { VisibilityService } from './ical/visibility.service';
import { HostInfoService } from './notifications/host-info.service';
import { EMAIL_TEMPLATES } from './notifications/email/build';
import { NOTIFICATION_CATEGORIES, ReservationNotifications } from './notifications/notifier.service';
import { ReservationScheduler } from './scheduler/scheduler.service';
import { ReservationsController } from './api/reservations.controller';
import { PLUGIN_CONTEXT, RESERVATION_CLOCK, RESERVATION_NOTIFIER } from './constants';
import { GlobalSettingsEntity } from './entities/global-settings.entity';
import { IcalFeedEntity } from './entities/ical-feed.entity';
import { NoticeEntity } from './entities/notice.entity';
import { ReservationEntity } from './entities/reservation.entity';
import { ResourceSettingsEntity } from './entities/resource-settings.entity';
import { AccessService } from './reservations/access.service';
import { RESERVATIONS_AUDIT_DOMAIN } from './reservations/audit';
import { DirectoryService } from './reservations/directory.service';
import { ReservationQueryService } from './reservations/reservation-query.service';
import { ReservationService } from './reservations/reservation.service';
import { ReservationStore } from './reservations/reservation.store';
import { GlobalSettingsService } from './settings/global-settings.service';
import { ResourceSettingsService } from './settings/resource-settings.service';
import { SettingsAdminService } from './settings/settings-admin.service';

class ReservationsPluginModule {}

const plugin: PluginBackendModule = {
  entities: [ReservationEntity, ResourceSettingsEntity, GlobalSettingsEntity, IcalFeedEntity, NoticeEntity],
  auditDomains: [RESERVATIONS_AUDIT_DOMAIN],
  notificationCategories: [...NOTIFICATION_CATEGORIES],
  emailTemplates: EMAIL_TEMPLATES,
  // The host calls the hooks as plain functions; they reach the services through hooks/runtime.
  preStartHook,
  sessionEndHook,
  startBlockedQuery,
  startCapacityHook,
  readerUi: readerUiProvider,
  register(context: PluginContext): DynamicModule {
    return {
      module: ReservationsPluginModule,
      controllers: [ReservationSettingsController, ReservationsController, IcalFeedsController, IcalPublicController],
      providers: [
        { provide: PLUGIN_CONTEXT, useValue: context },
        { provide: RESERVATION_CLOCK, useValue: () => new Date() },
        HostInfoService,
        ReservationNotifications,
        { provide: RESERVATION_NOTIFIER, useExisting: ReservationNotifications },
        DirectoryService,
        AccessService,
        ReservationStore,
        GlobalSettingsService,
        ResourceSettingsService,
        ReservationService,
        ReservationQueryService,
        SettingsAdminService,
        VisibilityService,
        IcalService,
        PendingDecisionStore,
        PendingDecisionService,
        PreStartService,
        StartCapacityService,
        SessionEndService,
        ReaderUiService,
        HookServicePublisher,
        ReservationEventHandlers,
        ReservationScheduler,
      ],
    };
  },
};

export default plugin;
