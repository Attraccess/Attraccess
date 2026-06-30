import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { SupervisionLiveEventDto } from './dtos/supervisionLiveEvent.dto';

/**
 * Per-supervisor realtime channel for supervision approval requests.
 *
 * Mirrors the billing/messaging live-notification pattern: each supervisor gets an on-demand
 * RxJS Subject that the SSE endpoint subscribes to, and the supervision service pushes events into.
 */
@Injectable()
export class SupervisionLiveService {
  private readonly subjects = new Map<number, Subject<{ data: SupervisionLiveEventDto }>>();

  public getSupervisorSubject(userId: number): Subject<{ data: SupervisionLiveEventDto }> {
    if (!this.subjects.has(userId)) {
      this.subjects.set(userId, new Subject<{ data: SupervisionLiveEventDto }>());
    }
    return this.subjects.get(userId);
  }

  public emitToSupervisor(userId: number, event: SupervisionLiveEventDto): void {
    this.getSupervisorSubject(userId).next({ data: event });
  }

  public deleteSubjectIfUnobserved(userId: number): void {
    const subject = this.subjects.get(userId);
    if (subject && !subject.observed) {
      this.subjects.delete(userId);
    }
  }
}
