import { Inject, Injectable } from '@nestjs/common';
import type { ReservationDto } from '../api/dto.response';
import { Clock, RESERVATION_CLOCK } from '../constants';
import type { ReservationActor } from '../reservations/actor';
import { ReservationQueryService } from '../reservations/reservation-query.service';
import { ReservationStore } from '../reservations/reservation.store';
import { PendingDecisionStore } from './pending-decisions';

/** Serves the "keep or free the rest?" question of a web/API user whose session just ended. */
@Injectable()
export class PendingDecisionService {
  constructor(
    @Inject(PendingDecisionStore) private readonly decisions: PendingDecisionStore,
    @Inject(ReservationStore) private readonly store: ReservationStore,
    @Inject(ReservationQueryService) private readonly queries: ReservationQueryService,
    @Inject(RESERVATION_CLOCK) private readonly clock: Clock,
  ) {}

  /** The caller's booking still awaiting a keep/free answer on the resource, or null. */
  async get(actor: ReservationActor, resourceId: number): Promise<ReservationDto | null> {
    const now = this.clock();
    const id = this.decisions.get(actor.userId, resourceId, now.getTime());
    if (id === null) return null;
    const reservation = await this.store.findById(id);
    const stillRunning =
      reservation !== null &&
      reservation.userId === actor.userId &&
      reservation.status === 'confirmed' &&
      reservation.startTime.getTime() <= now.getTime() &&
      reservation.endTime.getTime() > now.getTime();
    if (!stillRunning) {
      this.decisions.clear(actor.userId, resourceId);
      return null;
    }
    return (await this.queries.present(actor, [reservation]))[0];
  }

  /** Called after the holder kept or ended the booking explicitly. */
  clear(userId: number, resourceId: number): void {
    this.decisions.clear(userId, resourceId);
  }
}
