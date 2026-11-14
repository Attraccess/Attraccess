import type { ReservationEntity } from '../entities/reservation.entity';

/**
 * Event sink for reservation state changes. Called by ReservationService in the background AFTER the
 * change committed; failures are logged and never fail the request. Provided as `RESERVATION_NOTIFIER`
 * (ReservationNotifications in plugin.ts; a mock in the tests).
 */
export interface ReservationNotifier {
  /** A booking now waits for approval: notify the managers of the resource. */
  onPending(reservation: ReservationEntity): Promise<void> | void;
  /** A booking became confirmed (directly on creation, or by approval when `viaApproval`). */
  onConfirmed(reservation: ReservationEntity, context: { viaApproval: boolean }): Promise<void> | void;
  onRejected(reservation: ReservationEntity): Promise<void> | void;
  /** `byUserId` is the holder or a manager; `byHolder` tells which. */
  onCancelled(reservation: ReservationEntity, context: { byUserId: number; byHolder: boolean }): Promise<void> | void;
  /** Ended early by the holder or, when `byUserId` differs from the holder, by a manager. */
  onEndedEarly(reservation: ReservationEntity, context: { byUserId: number }): Promise<void> | void;
  /**
   * Cancelled by the system: the plugin was disabled for the resource (reason `reservations disabled`) or the
   * machine lost slots (reason `machine capacity reduced`, `byUserId` null when no user changed the limit).
   */
  onRemoved(reservation: ReservationEntity, context: { byUserId: number | null; reason: string }): Promise<void> | void;
}
