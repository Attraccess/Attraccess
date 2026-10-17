import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { LiveSubscription } from '@attraccess/shared';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { defer } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { LiveTopicProvider } from '../../live-updates/live-topic-provider';
import { LiveTopicsService } from '../../live-updates/live-topics.service';
import { SupervisionLiveService } from './supervision-live.service';

@Injectable()
export class SupervisionLiveTopicsProvider implements LiveTopicProvider, OnModuleInit {
  readonly topics = [{ topic: 'supervision', scope: 'user' }] as const;

  constructor(
    private readonly registry: LiveTopicsService,
    private readonly supervision: SupervisionLiveService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  source(_subscription: LiveSubscription, user: AuthenticatedUser) {
    // Only requests explicitly addressed to the session's supervisor are emitted.
    return defer(() => this.supervision.getSupervisorSubject(user.id).asObservable()).pipe(
      finalize(() => this.supervision.deleteSubjectIfUnobserved(user.id)),
    );
  }
}
