import type { StartCapacityContext, StartCapacityResult } from '@attraccess/plugins-backend-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { heldBookings } from '../reservations/capacity';
import { ReservationStore } from '../reservations/reservation.store';
import { ResourceSettingsService } from '../settings/resource-settings.service';
import { overriddenBookingIds, PreStartService } from './pre-start.service';
import { hookDeadline, waitUntil } from './runtime';

/**
 * The plugin's half of the host's atomic start check on machines with several slots. The host calls it inside its
 * serialized start transaction, so it reads only through the given manager: one indexed query for the running
 * confirmed bookings and, only when someone else holds one, one for their sessions. It answers how many slots are
 * held for people other than the starter; the host refuses the start when those plus the occupied slots fill the machine.
 */
@Injectable()
export class StartCapacityService {
  constructor(
    @Inject(ResourceSettingsService) private readonly settings: ResourceSettingsService,
    @Inject(ReservationStore) private readonly store: ReservationStore,
    @Inject(PreStartService) private readonly preStart: PreStartService,
  ) {}

  async evaluate(ctx: StartCapacityContext, deadline = hookDeadline()): Promise<StartCapacityResult> {
    if (!this.settings.isWarm) {
      await waitUntil(this.settings.whenReady(), deadline, 'Reservation settings are not loaded yet');
    }
    if (!this.settings.getCachedSettings(ctx.resourceId).enabled) return { heldSlots: 0 };

    const running = await this.store.findRunningConfirmed(ctx.manager, ctx.resourceId, ctx.now);
    // The starter's own running booking is the slot they take; the host's normal limit still applies.
    if (running.length === 0 || running.some((r) => r.userId === ctx.userId)) return { heldSlots: 0 };

    const holderIds = [...new Set(running.map((r) => r.userId))];
    const inSession = await this.store.findUsersInSession(ctx.manager, ctx.resourceId, holderIds);
    const held = heldBookings({
      confirmed: running,
      starterId: ctx.userId,
      inSession,
      at: ctx.now,
      overridden: overriddenBookingIds(ctx.confirmedStepKeys),
    });
    if (held.length === 0 || ctx.occupiedSlots + held.length < ctx.sessionLimit) return { heldSlots: held.length };
    return {
      heldSlots: held.length,
      reason: await this.preStart.reservedBlockReason(ctx, held[0], ctx.now),
    };
  }
}
