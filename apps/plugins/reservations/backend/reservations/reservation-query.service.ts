import type { PluginAuditPrincipal, PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import type { AvailabilityDto, ManagedReservationListDto, ReservationDto } from '../api/dto.response';
import { Clock, PLUGIN_CONTEXT, RESERVATION_CLOCK } from '../constants';
import { ReservationEntity, ReservationStatus } from '../entities/reservation.entity';
import { GlobalSettingsService } from '../settings/global-settings.service';
import { ResourceSettingsService } from '../settings/resource-settings.service';
import { AccessService } from './access.service';
import { DirectoryService } from './directory.service';
import { ReservationError } from './errors';
import { Viewer, presentReservation } from './presenter';
import { ReservationStore } from './reservation.store';
import { ReservationService } from './reservation.service';

const DAY_MS = 86_400_000;
export const MAX_AVAILABILITY_RANGE_DAYS = 62;
export const MANAGE_PAGE_SIZE = 25;

/** Read side: availability, my bookings, manager list. Everything leaving here is already redacted. */
@Injectable()
export class ReservationQueryService {
  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(ReservationStore) private readonly store: ReservationStore,
    @Inject(ResourceSettingsService) private readonly settings: ResourceSettingsService,
    @Inject(GlobalSettingsService) private readonly globalSettings: GlobalSettingsService,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(DirectoryService) private readonly directory: DirectoryService,
    @Inject(ReservationService) private readonly reservations: ReservationService,
    @Inject(RESERVATION_CLOCK) private readonly clock: Clock,
  ) {}

  /** Maps entities to DTOs with names and manager flags resolved in bulk (2 name queries). */
  async present(
    actor: PluginAuditPrincipal,
    rows: ReservationEntity[],
    knownManaged?: Map<number, boolean>,
  ): Promise<ReservationDto[]> {
    const managed = knownManaged ?? new Map<number, boolean>();
    for (const resourceId of new Set(rows.map((row) => row.resourceId))) {
      if (!managed.has(resourceId)) managed.set(resourceId, await this.access.isManager(actor.userId, resourceId));
    }
    const viewer: Viewer = { userId: actor.userId, isManager: (resourceId) => managed.get(resourceId) === true };
    const visibleUserIds = rows
      .filter((row) => row.userId === actor.userId || viewer.isManager(row.resourceId))
      .map((row) => row.userId);
    const [resourceNames, userNames] = await Promise.all([
      this.directory.getResourceNames(rows.map((row) => row.resourceId)),
      this.directory.getUserNames(visibleUserIds),
    ]);
    const now = this.clock();
    return rows.map((row) =>
      presentReservation(row, viewer, {
        now,
        resourceName: resourceNames.get(row.resourceId) ?? null,
        userName: userNames.get(row.userId) ?? null,
      }),
    );
  }

  async get(actor: PluginAuditPrincipal, id: number): Promise<ReservationDto> {
    const { reservation, isManager } = await this.reservations.getForActor(actor, id);
    return (await this.present(actor, [reservation], new Map([[reservation.resourceId, isManager]])))[0];
  }

  async listMine(
    actor: PluginAuditPrincipal,
    scope: 'upcoming' | 'past',
    status?: ReservationStatus,
  ): Promise<ReservationDto[]> {
    const rows = await this.store.listForUser(actor.userId, scope, this.clock(), status);
    return this.present(actor, rows);
  }

  async listManaged(
    actor: PluginAuditPrincipal,
    filter: { resourceId?: number; status?: ReservationStatus; from?: Date; to?: Date; page: number },
  ): Promise<ManagedReservationListDto> {
    const managedIds = await this.access.managedResourceIds(actor.userId);
    let resourceIds = managedIds;
    if (filter.resourceId !== undefined) {
      if (managedIds !== null && !managedIds.includes(filter.resourceId)) {
        throw new ReservationError('FORBIDDEN', 'You do not manage this resource');
      }
      resourceIds = [filter.resourceId];
    }
    const page = Math.max(1, filter.page);
    const { items, total } = await this.store.listManaged({
      resourceIds,
      status: filter.status,
      from: filter.from,
      to: filter.to,
      skip: (page - 1) * MANAGE_PAGE_SIZE,
      take: MANAGE_PAGE_SIZE,
    });
    const managedMap = new Map(items.map((item) => [item.resourceId, true] as const));
    return { items: await this.present(actor, items, managedMap), total, page, pageSize: MANAGE_PAGE_SIZE };
  }

  /** Booking view of a resource over [from, to): occupying bookings (redacted), rules, caller permissions. */
  async availability(actor: PluginAuditPrincipal, resourceId: number, from: Date, to: Date): Promise<AvailabilityDto> {
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to.getTime() <= from.getTime()) {
      throw new ReservationError('INVALID_RANGE', 'to must be after from');
    }
    if (to.getTime() - from.getTime() > MAX_AVAILABILITY_RANGE_DAYS * DAY_MS) {
      throw new ReservationError('RANGE_TOO_LARGE', `The range may span at most ${MAX_AVAILABILITY_RANGE_DAYS} days`);
    }
    if (!(await this.directory.getResource(resourceId)))
      throw new ReservationError('RESOURCE_NOT_FOUND', 'Resource not found');
    const settings = await this.settings.get(resourceId);
    const [timezone, isManager, canBook] = await Promise.all([
      this.globalSettings.getTimezone(),
      this.access.isManager(actor.userId, resourceId),
      this.access.canBook(actor.userId, resourceId, settings),
    ]);
    const rules: AvailabilityDto['rules'] = {
      approvalRequired: settings.approvalRequired,
      timeStepMinutes: settings.timeStepMinutes,
      minDurationMinutes: settings.minDurationMinutes,
      maxDurationMinutes: settings.maxDurationMinutes,
      maxAdvanceDays: settings.maxAdvanceDays,
      minLeadMinutes: settings.minLeadMinutes,
      bufferBeforeMinutes: settings.bufferBeforeMinutes,
      bufferAfterMinutes: settings.bufferAfterMinutes,
      maxActiveBookingsPerUser: settings.maxActiveBookingsPerUser,
      whoCanBook: settings.whoCanBook,
      checkInEnabled: settings.checkInEnabled,
      checkInGraceMinutes: settings.checkInGraceMinutes,
      earlyCheckInMinutes: settings.earlyCheckInMinutes,
      bookableHours: settings.bookableHours as Record<string, { start: string; end: string }[]>,
    };
    const base = { resourceId, enabled: settings.enabled, timezone, isManager, canBook, rules };
    if (!settings.enabled) return { ...base, reservations: [], maintenance: [] };
    const [rows, windows] = await Promise.all([
      this.store.findOccupying(resourceId, from, to),
      this.context.resourceAccess.getMaintenanceWindows(resourceId, from, to),
    ]);
    return {
      ...base,
      reservations: await this.present(actor, rows, new Map([[resourceId, isManager]])),
      maintenance: windows.map((window) => ({
        startTime: window.startTime.toISOString(),
        endTime: window.endTime ? window.endTime.toISOString() : null,
      })),
    };
  }
}
