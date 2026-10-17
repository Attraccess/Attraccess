import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { LiveSubscription } from '@attraccess/shared';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { defer } from 'rxjs';
import { LiveTopicProvider } from '../live-updates/live-topic-provider';
import { LiveTopicsService } from '../live-updates/live-topics.service';
import { MessagingLiveService } from './messaging-live.service';

@Injectable()
export class MessagingLiveTopicsProvider implements LiveTopicProvider, OnModuleInit {
  readonly topics = [{ topic: 'messaging', scope: 'user' }] as const;

  constructor(
    private readonly registry: LiveTopicsService,
    private readonly messaging: MessagingLiveService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  source(_subscription: LiveSubscription, user: AuthenticatedUser) {
    return this.messaging.trackPresence(
      user.id,
      defer(() => this.messaging.getUserMessageSubject(user.id).asObservable()),
    );
  }
}
