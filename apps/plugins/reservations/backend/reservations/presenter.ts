import type { ReservationDto } from '../api/dto.response';
import type { ReservationEntity } from '../entities/reservation.entity';

export interface Viewer {
  userId: number;
  /** Whether the viewer manages the reservation's resource. */
  isManager: (resourceId: number) => boolean;
}

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);

/**
 * Maps a reservation to its API shape. Holder identity, note and decision/cancel details leave this
 * function ONLY for the holder and managers of the resource; everyone else gets times, buffers and the
 * status. This is the single redaction point for API (and part 2's iCal).
 */
export function presentReservation(
  reservation: ReservationEntity,
  viewer: Viewer,
  context: { now: Date; resourceName: string | null; userName: string | null },
): ReservationDto {
  const mine = reservation.userId === viewer.userId;
  const manager = viewer.isManager(reservation.resourceId);
  const full = mine || manager;
  const now = context.now.getTime();
  const live = reservation.status === 'pending' || reservation.status === 'confirmed';
  const future = reservation.endTime.getTime() > now;
  const started = reservation.startTime.getTime() <= now;
  const running = reservation.status === 'confirmed' && started && future;
  return {
    id: reservation.id,
    resourceId: reservation.resourceId,
    resourceName: context.resourceName,
    startTime: reservation.startTime.toISOString(),
    endTime: reservation.endTime.toISOString(),
    bufferBeforeMinutes: reservation.bufferBeforeMinutes,
    bufferAfterMinutes: reservation.bufferAfterMinutes,
    status: reservation.status,
    mine,
    userId: full ? reservation.userId : null,
    userName: full ? context.userName : null,
    note: full ? reservation.note : null,
    createdAt: full ? iso(reservation.createdAt) : null,
    endedEarlyAt: full ? iso(reservation.endedEarlyAt) : null,
    cancelledBy: full ? reservation.cancelledBy : null,
    cancelReason: full ? reservation.cancelReason : null,
    decidedBy: full ? reservation.decidedBy : null,
    decisionReason: full ? reservation.decisionReason : null,
    decidedAt: full ? iso(reservation.decidedAt) : null,
    checkedInAt: full ? iso(reservation.checkedInAt) : null,
    canCancel: full && live && future && !running,
    canEndEarly: full && running,
    canKeep: mine && live && future && !reservation.keptAt,
    canDecide: manager && reservation.status === 'pending' && !started,
  };
}
