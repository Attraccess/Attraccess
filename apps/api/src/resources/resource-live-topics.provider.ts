import { Resource } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { LiveSubscription, liveSubscriptionKey } from '@attraccess/shared';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { defer } from 'rxjs';
import { finalize, map } from 'rxjs/operators';
import { LiveTopicProvider } from '../live-updates/live-topic-provider';
import { LiveTopicsService } from '../live-updates/live-topics.service';
import { ResourceEventsService } from './sse/resource-events.service';
import { FlowLogRecorderService } from './flows/logs/flow-log-recorder.service';
import { ResourceActivityVisibilityService } from './usage/authorization/resource-activity-visibility.service';

@Injectable()
export class ResourceLiveTopicsProvider implements LiveTopicProvider, OnModuleInit {
  readonly topics = [
    { topic: 'resource', scope: 'resource' },
    { topic: 'flow-logs', scope: 'resource' },
  ] as const;

  constructor(
    private readonly registry: LiveTopicsService,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    private readonly resourceEvents: ResourceEventsService,
    private readonly flowLogs: FlowLogRecorderService,
    private readonly activityVisibility: ResourceActivityVisibilityService,
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
    const resources = await this.resources.find({ where: { id: In(ids) }, select: { id: true } });
    const existingIds = new Set(resources.map((resource) => resource.id));
    const rejected = new Map<string, string>();
    const access = await this.activityVisibility.resolveMany(user, [...existingIds]);
    for (const subscription of subscriptions) {
      if (subscription.topic === 'flow-logs' && !user.effectivePermissions?.has('resources.update')) {
        rejected.set(liveSubscriptionKey(subscription), 'Resource update permission required');
      } else if (!existingIds.has(subscription.resourceId)) {
        rejected.set(liveSubscriptionKey(subscription), 'Resource not found');
      } else if (subscription.topic === 'resource' && access.get(subscription.resourceId) === 'none') {
        rejected.set(liveSubscriptionKey(subscription), 'Activity on this resource is not visible');
      }
    }
    return rejected;
  }

  async source(subscription: LiveSubscription, user: AuthenticatedUser) {
    if (subscription.topic === 'resource') {
      const access = await this.activityVisibility.resolve(user, subscription.resourceId);
      if (access === 'none') throw new Error('Activity on this resource is not visible');
      const stream = await this.resourceEvents.subscribeResource(subscription.resourceId);
      return stream.pipe(map((event) => this.activityVisibility.viewLiveEvent(event, access, user.id)));
    }
    if (subscription.topic === 'flow-logs') {
      return defer(() => this.flowLogs.subjectFor(subscription.resourceId).asObservable()).pipe(
        finalize(() => this.flowLogs.releaseSubject(subscription.resourceId)),
      );
    }
    throw new Error('Unsupported resource topic');
  }
}
