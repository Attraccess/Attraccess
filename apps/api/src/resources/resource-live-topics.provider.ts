import { ResourceEventPersistence } from './persistence/port';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk/v2';
import { LiveSubscription, liveSubscriptionKey } from '@attraccess/shared';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { defer } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { LiveTopicProvider } from '../live-updates/live-topic-provider';
import { LiveTopicsService } from '../live-updates/live-topics.service';
import { ResourceEventsService } from './sse/resource-events.service';
import { FlowLogRecorderService } from './flows/logs/flow-log-recorder.service';

@Injectable()
export class ResourceLiveTopicsProvider implements LiveTopicProvider, OnModuleInit {
  readonly topics = [
    { topic: 'resource', scope: 'resource' },
    { topic: 'flow-logs', scope: 'resource' },
  ] as const;

  constructor(
    private readonly registry: LiveTopicsService,
    private readonly resources: ResourceEventPersistence,
    private readonly resourceEvents: ResourceEventsService,
    private readonly flowLogs: FlowLogRecorderService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async authorize(
    subscriptions: readonly LiveSubscription[],
    user: AuthenticatedUser,
  ): Promise<ReadonlyMap<string, string>> {
    // Both resource topics share one lookup per set/renewal, even for overlapping IDs.
    const ids = [...new Set(subscriptions.map((subscription) => subscription.resourceId))];
    const existingIds = new Set(await this.resources.existingIds(ids));
    const rejected = new Map<string, string>();
    for (const subscription of subscriptions) {
      if (subscription.topic === 'flow-logs' && !user.effectivePermissions?.has('resources.update')) {
        rejected.set(liveSubscriptionKey(subscription), 'Resource update permission required');
      } else if (!existingIds.has(subscription.resourceId)) {
        rejected.set(liveSubscriptionKey(subscription), 'Resource not found');
      }
    }
    return rejected;
  }

  source(subscription: LiveSubscription) {
    if (subscription.topic === 'resource') return this.resourceEvents.subscribeResource(subscription.resourceId);
    if (subscription.topic === 'flow-logs') {
      return defer(() => this.flowLogs.subjectFor(subscription.resourceId).asObservable()).pipe(
        finalize(() => this.flowLogs.releaseSubject(subscription.resourceId)),
      );
    }
    throw new Error('Unsupported resource topic');
  }
}
