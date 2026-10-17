import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { SystemNotificationLiveEventDto } from './dtos/system-notification-live-event.dto';

@Injectable()
export class NotificationLiveService {
  private readonly subjects = new Map<number, Subject<{ data: SystemNotificationLiveEventDto }>>();
  private readonly userPresence = new Map<number, boolean>();
  private readonly visibleConnections = new Map<number, Set<string>>();

  public getUserSubject(userId: number): Subject<{ data: SystemNotificationLiveEventDto }> {
    if (!this.subjects.has(userId)) {
      this.subjects.set(userId, new Subject<{ data: SystemNotificationLiveEventDto }>());
    }

    return this.subjects.get(userId);
  }

  public deleteSubjectIfUnobserved(userId: number): void {
    const subject = this.subjects.get(userId);
    if (subject && !subject.observed) {
      this.subjects.delete(userId);
      this.userPresence.delete(userId);
    }
  }

  public emitToUser(userId: number, event: SystemNotificationLiveEventDto): void {
    this.subjects.get(userId)?.next({ data: event });
  }

  public setUserPresent(userId: number, present: boolean): void {
    if (present) this.userPresence.set(userId, true);
    else this.userPresence.delete(userId);
  }

  public setConnectionPresent(userId: number, connectionId: string, present: boolean): void {
    if (present) {
      let connections = this.visibleConnections.get(userId);
      if (!connections) {
        connections = new Set();
        this.visibleConnections.set(userId, connections);
      }
      connections.add(connectionId);
    } else {
      const connections = this.visibleConnections.get(userId);
      connections?.delete(connectionId);
      if (connections?.size === 0) this.visibleConnections.delete(userId);
    }
  }

  public isUserPresent(userId: number): boolean {
    return Boolean(this.userPresence.get(userId) || this.visibleConnections.get(userId)?.size);
  }
}
