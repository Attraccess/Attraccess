import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import type { AvailabilityDto, ManagedReservationListDto, ReservationDto } from '../api/dto.response';
import { Clock, PLUGIN_CONTEXT, RESERVATION_CLOCK } from '../constants';
import { ReservationEntity, ReservationStatus } from '../entities/reservation.entity';
import { VisibilityService } from '../ical/visibility.service';
import { GlobalSettingsService } from '../settings/global-settings.service';
import { ResourceSettingsService } from '../settings/resource-settings.service';
import type { ResourceSettings } from '../settings/settings.model';
import { AccessService, type CanBookResult } from './access.service';
import type { ReservationActor } from './actor';
import { DirectoryService } from './directory.service';
import { ReservationError } from './errors';
import { Viewer, presentReservation } from './presenter';
import { MAX_BUFFER_MINUTES, ReservationStore } from './reservation.store';
import { ReservationService } from './reservation.service';
import { blockedSpan, spansOverlap } from './rules';

const MINUTE_MS = 60_000;
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
    @Inject(VisibilityService) private readonly visibility: VisibilityService,
  ) {}

  /**
   * Maps entities to DTOs with names and manager flags resolved in bulk: one managed-resources lookup (only
   * when `knownManaged` does not cover every resource) and 2 name queries.
   */
  async present(
    actor: ReservationActor,
    rows: ReservationEntity[],
    knownManaged?: Map<number, boolean>,
  ): Promise<ReservationDto[]> {
    const known = knownManaged ?? new Map<number, boolean>();
    const managed = rows.every((row) => known.has(row.resourceId)) ? [] : await this.access.managedResourceIds(actor);
    const managedIds = new Set(managed ?? []);
    const isManager = (resourceId: number) => known.get(resourceId) ?? (managed === null || managedIds.has(resourceId));
    // Only the resources of other people's bookings need core's attribution answer.
    const attributed = await this.access.attributionResourceIds(
      actor,
      rows.filter((row) => row.userId !== actor.userId && !isManager(row.resourceId)).map((row) => row.resourceId),
    );
    const viewer: Viewer = {
      userId: actor.userId,
      isManager,
      seesHolderName: (resourceId) => attributed.has(resourceId),
    };
    const visibleUserIds = rows
      .filter((row) => row.userId === actor.userId || isManager(row.resourceId) || attributed.has(row.resourceId))
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

  async get(actor: ReservationActor, id: number): Promise<ReservationDto> {
    const { reservation, isManager } = await this.reservations.getForActor(actor, id);
    return (await this.present(actor, [reservation], new Map([[reservation.resourceId, isManager]])))[0];
  }

  async listMine(
    actor: ReservationActor,
    scope: 'upcoming' | 'past',
    status?: ReservationStatus,
  ): Promise<ReservationDto[]> {
    const rows = await this.store.listForUser(actor.userId, scope, this.clock(), status);
    return this.present(actor, rows);
  }

  async listManaged(
    actor: ReservationActor,
    filter: { resourceId?: number; status?: ReservationStatus; from?: Date; to?: Date; page: number },
  ): Promise<ManagedReservationListDto> {
    const managedIds = await this.access.managedResourceIds(actor);
    // The manager pages and the frontend's "do I manage anything" probe rely on this being a 403, not an empty list.
    if (managedIds !== null && managedIds.length === 0) {
      throw new ReservationError('FORBIDDEN', 'You do not manage any resource');
    }
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

  /** Whether the caller manages at least one resource (drives the manager pages' visibility). */
  async managerAccess(actor: ReservationActor): Promise<{ isManager: boolean }> {
    const managedIds = await this.access.managedResourceIds(actor);
    return { isManager: managedIds === null || managedIds.length > 0 };
  }

  /**
   * Booking view of a resource over [from, to): occupying bookings (redacted), maintenance, rules and the
   * caller's permissions. Resources the caller may not see answer 404 like unknown ones. Bookings and
   * maintenance are fetched for the range widened by this resource's buffers, so everything that can
   * conflict with a booking starting and ending inside [from, to) is included (see `AvailabilityDto`).
   */
  async availability(actor: ReservationActor, resourceId: number, from: Date, to: Date): Promise<AvailabilityDto> {
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to.getTime() <= from.getTime()) {
      throw new ReservationError('INVALID_RANGE', 'to must be after from');
    }
    if (to.getTime() - from.getTime() > MAX_AVAILABILITY_RANGE_DAYS * DAY_MS) {
      throw new ReservationError('RANGE_TOO_LARGE', `The range may span at most ${MAX_AVAILABILITY_RANGE_DAYS} days`);
    }
    // Existence and visibility in one query (filterVisible only returns existing resources).
    if ((await this.visibility.filterVisible(actor, [resourceId])).length === 0) {
      throw new ReservationError('RESOURCE_NOT_FOUND', 'Resource not found');
    }
    await this.settings.whenReady();
    const settings = this.settings.getCachedSettings(resourceId);
    const timezone = await this.globalSettings.getTimezone();
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
    if (!settings.enabled) {
      // No permission lookups for disabled resources (the booking card is hidden for them anyway).
      const canBook: CanBookResult = { allowed: false, reason: 'RESERVATIONS_DISABLED' };
      return {
        resourceId,
        enabled: false,
        timezone,
        isManager: false,
        canBook,
        rules,
        reservations: [],
        maintenance: [],
      };
    }
    const isManager = await this.access.isManager(actor, resourceId);
    const canBook = await this.canBook(actor, resourceId, settings, isManager);
    // A booking inside [from, to) blocks [start - bufferBefore, end + bufferAfter); stored bookings carry their
    // own buffers (at most MAX_BUFFER_MINUTES each), so the query is widened by that and filtered exactly.
    const span = {
      start: new Date(from.getTime() - settings.bufferBeforeMinutes * MINUTE_MS),
      end: new Date(to.getTime() + settings.bufferAfterMinutes * MINUTE_MS),
    };
    const margin = MAX_BUFFER_MINUTES * MINUTE_MS;
    const [candidates, windows] = await Promise.all([
      this.store.findOccupying(
        resourceId,
        new Date(span.start.getTime() - margin),
        new Date(span.end.getTime() + margin),
      ),
      this.context.resourceAccess.getMaintenanceWindows(resourceId, span.start, span.end),
    ]);
    const rows = candidates.filter((row) => spansOverlap(blockedSpan(row), span));
    return {
      resourceId,
      enabled: true,
      timezone,
      isManager,
      canBook,
      rules,
      reservations: await this.present(actor, rows, new Map([[resourceId, isManager]])),
      maintenance: windows.map((window) => ({
        startTime: window.startTime.toISOString(),
        endTime: window.endTime ? window.endTime.toISOString() : null,
      })),
    };
  }

  /**
   * `AccessService.canBook` with the already resolved manager flag (managers may always book), plus the per-user
   * cap a booking attempt would hit (`USER_BOOKING_LIMIT`), counted like the create path does.
   */
  private async canBook(
    actor: ReservationActor,
    resourceId: number,
    settings: ResourceSettings,
    isManager: boolean,
  ): Promise<CanBookResult> {
    const result = await this.access.canBook(actor, resourceId, settings, isManager);
    if (!result.allowed || settings.maxActiveBookingsPerUser === 0) return result;
    const manager = this.context.getRepository(ReservationEntity).manager;
    const live = await this.store.countLiveForUser(manager, actor.userId, resourceId, this.clock());
    return live >= settings.maxActiveBookingsPerUser ? { allowed: false, reason: 'USER_BOOKING_LIMIT' } : result;
  }
}
