import { Subject } from 'rxjs';
import type { ClusterService } from '../cluster/cluster.service';

/**
 * Per-user live channels whose events reach the user's SSE streams on every API instance (ATT-1163). An event
 * emitted here goes to this instance's subscribers and is broadcast over the cluster bus to the others, which hand
 * it to theirs. Without Valkey it is a plain per-process map of subjects.
 *
 * Built for any live topic; mass introductions and supervision use it so far.
 */
export class ClusterUserSubjects<T> {
  private readonly subjects = new Map<number, Subject<{ data: T }>>();
  private readonly messageType: string;

  constructor(
    topic: string,
    private readonly cluster?: ClusterService,
  ) {
    this.messageType = `live:${topic}`;
    cluster?.bus.on(this.messageType, (payload) => {
      const { userId, event } = payload as { userId: number; event: T };
      this.emitLocally(userId, event);
    });
  }

  subject(userId: number): Subject<{ data: T }> {
    let subject = this.subjects.get(userId);
    if (!subject) {
      subject = new Subject<{ data: T }>();
      this.subjects.set(userId, subject);
    }
    return subject;
  }

  emit(userId: number, event: T): void {
    this.emitLocally(userId, event);
    if (this.cluster?.enabled) void this.cluster.bus.broadcast(this.messageType, { userId, event });
  }

  deleteIfUnobserved(userId: number): void {
    const subject = this.subjects.get(userId);
    if (subject && !subject.observed) this.subjects.delete(userId);
  }

  private emitLocally(userId: number, event: T): void {
    this.subjects.get(userId)?.next({ data: event });
  }
}
