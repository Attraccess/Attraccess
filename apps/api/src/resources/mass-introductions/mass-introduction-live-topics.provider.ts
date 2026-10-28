import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { LiveSubscription } from '@attraccess/shared';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { defer } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { LiveTopicProvider } from '../../live-updates/live-topic-provider';
import { LiveTopicsService } from '../../live-updates/live-topics.service';
import { MassIntroductionLiveService } from './mass-introduction-live.service';

@Injectable()
export class MassIntroductionLiveTopicsProvider implements LiveTopicProvider, OnModuleInit {
  readonly topics = [{ topic: 'mass-introduction', scope: 'user' }] as const;

  constructor(
    private readonly registry: LiveTopicsService,
    private readonly live: MassIntroductionLiveService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  source(_subscription: LiveSubscription, user: AuthenticatedUser) {
    // Only the sessions this user started are emitted.
    return defer(() => this.live.getIntroducerSubject(user.id).asObservable()).pipe(
      finalize(() => this.live.deleteSubjectIfUnobserved(user.id)),
    );
  }
}
