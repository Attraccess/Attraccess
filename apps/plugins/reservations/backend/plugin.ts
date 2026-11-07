// Reservations plugin — backend half. Users reserve a resource for a time window; the plugin never
// terminates or takes over sessions. This file wires the Nest module; logic lives in services.
//
// Single API instance assumed: the settings cache, the per-resource creation mutex and (part 2) the
// scheduler are in-process. Distributed lock, cross-instance booking lock and cache invalidation are
// tracked in ATT-1146.
import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk';
import { DynamicModule } from '@nestjs/common';
import { ReservationSettingsController } from './api/settings.controller';
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
import { NoopReservationNotifier } from './reservations/notifier';
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
  notificationCategories: [{ id: 'reservations', label: { en: 'Reservations', de: 'Reservierungen' } }],
  register(context: PluginContext): DynamicModule {
    return {
      module: ReservationsPluginModule,
      controllers: [ReservationSettingsController, ReservationsController],
      providers: [
        { provide: PLUGIN_CONTEXT, useValue: context },
        { provide: RESERVATION_CLOCK, useValue: () => new Date() },
        // Part 2 replaces this no-op with the real notification-sending implementation.
        { provide: RESERVATION_NOTIFIER, useClass: NoopReservationNotifier },
        DirectoryService,
        AccessService,
        ReservationStore,
        GlobalSettingsService,
        ResourceSettingsService,
        ReservationService,
        ReservationQueryService,
        SettingsAdminService,
      ],
    };
  },
};

export default plugin;
