import { Inject, Injectable } from '@nestjs/common';
import { AccessService } from '../reservations/access.service';
import type { ReservationActor } from '../reservations/actor';
import { DirectoryService } from '../reservations/directory.service';
import { ReservationError } from '../reservations/errors';
import { ReservationService } from '../reservations/reservation.service';
import { GlobalSettingsService } from './global-settings.service';
import { ResourceSettingsService } from './resource-settings.service';
import { ResourceSettings, ResourceSettingsValues, changedSettingKeys, settingsValues } from './settings.model';

/** Manager-facing settings operations (permission checks, disabling policy, audit). */
@Injectable()
export class SettingsAdminService {
  constructor(
    @Inject(ResourceSettingsService) private readonly settings: ResourceSettingsService,
    @Inject(GlobalSettingsService) private readonly globalSettings: GlobalSettingsService,
    @Inject(ReservationService) private readonly reservations: ReservationService,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(DirectoryService) private readonly directory: DirectoryService,
  ) {}

  async assertManager(actor: ReservationActor, resourceId: number): Promise<void> {
    if (!(await this.directory.getResource(resourceId)))
      throw new ReservationError('RESOURCE_NOT_FOUND', 'Resource not found');
    if (!(await this.access.isManager(actor, resourceId))) {
      throw new ReservationError('FORBIDDEN', 'Only managers of this resource can manage its reservation settings');
    }
  }

  async getForManager(actor: ReservationActor, resourceId: number): Promise<ResourceSettings> {
    await this.assertManager(actor, resourceId);
    return this.settings.get(resourceId);
  }

  async futureBookingsCount(actor: ReservationActor, resourceId: number): Promise<number> {
    await this.assertManager(actor, resourceId);
    return this.reservations.countFutureBookings(resourceId);
  }

  async update(
    actor: ReservationActor,
    resourceId: number,
    patch: Partial<ResourceSettingsValues> & { cancelFutureBookings?: boolean },
  ): Promise<{ settings: ResourceSettings; cancelledBookings: number }> {
    await this.assertManager(actor, resourceId);
    const { cancelFutureBookings, ...values } = patch;
    // Same per-resource lock as ReservationService.create(): a create racing with disabling either
    // commits before (and is counted / cancelled here) or runs after and sees `enabled: false`.
    const { before, after, cancelledBookings } = await this.reservations.withResourceLock(resourceId, async () => {
      const current = await this.settings.get(resourceId);
      const disabling = current.enabled && values.enabled === false;
      if (disabling && cancelFutureBookings === undefined) {
        const count = await this.reservations.countFutureBookings(resourceId);
        if (count > 0) {
          throw new ReservationError(
            'FUTURE_BOOKINGS_EXIST',
            'Future bookings exist; set cancelFutureBookings to true to cancel them or false to keep them',
            { count },
          );
        }
      }
      const updated = await this.settings.update(resourceId, values);
      const cancelled =
        disabling && cancelFutureBookings ? await this.reservations.cancelFutureBookings(actor, resourceId) : 0;
      return { ...updated, cancelledBookings: cancelled };
    });
    const changed = changedSettingKeys(settingsValues(before), settingsValues(after));
    if (changed.length > 0) this.reservations.invalidateViews(resourceId);
    if (changed.length > 0 || cancelledBookings > 0) {
      await this.reservations.auditLog.record(
        'settings_changed',
        actor,
        { type: 'resource', id: resourceId },
        {
          enabled: after.enabled,
          changedFields: changed.join(','),
          cancelledBookings,
        },
      );
    }
    return { settings: after, cancelledBookings };
  }

  getGlobal(): Promise<{ timezone: string; defaultTimezone: string }> {
    return this.globalSettings.getGlobal();
  }

  async setTimezone(actor: ReservationActor, timezone: string): Promise<{ timezone: string; defaultTimezone: string }> {
    const { before } = await this.globalSettings.setTimezone(timezone);
    if (before !== timezone) {
      // Reader slots write times in this timezone.
      for (const resourceId of this.settings.getEnabledResourceIds()) this.reservations.invalidateViews(resourceId);
      await this.reservations.auditLog.record(
        'settings_changed',
        actor,
        { type: 'global', id: 1 },
        { changedFields: 'timezone' },
      );
    }
    return this.globalSettings.getGlobal();
  }
}
