import { Injectable } from '@nestjs/common';
import type { ReservationEntity } from '../entities/reservation.entity';

/**
 * Event sink for reservation state changes. Called by the services AFTER the change committed;
 * failures are logged and never fail the request. Part 2 provides the real implementation (in-app /
 * email notifications) by replacing the `RESERVATION_NOTIFIER` provider in plugin.ts.
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
  /** Cancelled because the plugin was disabled for the resource (reason `reservations disabled`). */
  onRemoved(reservation: ReservationEntity, context: { byUserId: number; reason: string }): Promise<void> | void;
}

@Injectable()
export class NoopReservationNotifier implements ReservationNotifier {
  onPending(): void {
    /* no-op */
  }
  onConfirmed(): void {
    /* no-op */
  }
  onRejected(): void {
    /* no-op */
  }
  onCancelled(): void {
    /* no-op */
  }
  onEndedEarly(): void {
    /* no-op */
  }
  onRemoved(): void {
    /* no-op */
  }
}
