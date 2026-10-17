import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { LiveSubscription } from '@attraccess/shared';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { defer } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { LiveTopicProvider } from '../live-updates/live-topic-provider';
import { LiveTopicsService } from '../live-updates/live-topics.service';
import { NotificationLiveService } from './notification-live.service';

@Injectable()
export class NotificationLiveTopicsProvider implements LiveTopicProvider, OnModuleInit {
  readonly topics = [{ topic: 'notifications', scope: 'user' }] as const;

  constructor(
    private readonly registry: LiveTopicsService,
    private readonly notifications: NotificationLiveService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  source(_subscription: LiveSubscription, user: AuthenticatedUser) {
    return defer(() => this.notifications.getUserSubject(user.id).asObservable()).pipe(
      finalize(() => this.notifications.deleteSubjectIfUnobserved(user.id)),
    );
  }

  setPresence(_subscription: LiveSubscription, userId: number, connectionId: string, present: boolean): void {
    this.notifications.setConnectionPresent(userId, connectionId, present);
  }
}
