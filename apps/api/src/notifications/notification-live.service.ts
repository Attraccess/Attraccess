import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { SystemNotificationLiveEventDto } from './dtos/system-notification-live-event.dto';

@Injectable()
export class NotificationLiveService {
  private readonly subjects = new Map<number, Subject<{ data: SystemNotificationLiveEventDto }>>();
  private readonly userPresence = new Map<number, boolean>();

  public getUserSubject(userId: number): Subject<{ data: SystemNotificationLiveEventDto }> {
    if (!this.subjects.has(userId)) {
      this.subjects.set(userId, new Subject<{ data: SystemNotificationLiveEventDto }>());
    }

    return this.subjects.get(userId);
  }

  public emitToUser(userId: number, event: SystemNotificationLiveEventDto): void {
    this.getUserSubject(userId).next({ data: event });
  }

  public setUserPresent(userId: number, present: boolean): void {
    this.userPresence.set(userId, present);
  }

  public isUserPresent(userId: number): boolean {
    return this.userPresence.get(userId) ?? false;
  }
}
