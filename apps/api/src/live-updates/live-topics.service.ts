import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Resource } from '@attraccess/database-entities';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { LiveSubscription } from '@attraccess/shared';
import { In, Repository } from 'typeorm';
import { defer, Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ResourceEventsService } from '../resources/sse/resource-events.service';
import { FlowLogRecorderService } from '../resources/flows/flow-log-recorder.service';
import { LiveNotificationsService } from '../billing/liveNotificationsService';
import { MessagingLiveService } from '../messaging/messaging-live.service';
import { NotificationLiveService } from '../notifications/notification-live.service';
import { SupervisionLiveService } from '../resources/supervision/supervision-live.service';

@Injectable()
export class LiveTopicsService {
  constructor(
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    private readonly resourceEvents: ResourceEventsService,
    private readonly flowLogs: FlowLogRecorderService,
    private readonly billing: LiveNotificationsService,
    private readonly messaging: MessagingLiveService,
    private readonly notifications: NotificationLiveService,
    private readonly supervision: SupervisionLiveService,
  ) {}

  setWebPresence(userId: number, connectionId: string, present: boolean): void {
    this.notifications.setConnectionPresent(userId, connectionId, present);
  }

  parse(value: unknown): LiveSubscription {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Invalid topic');
    const { topic, resourceId } = value as Record<string, unknown>;
    if (Object.keys(value).some((key) => key !== 'topic' && key !== 'resourceId')) {
      throw new BadRequestException('Unexpected topic fields');
    }
    if (topic === 'resource' || topic === 'flow-logs') {
      if (typeof resourceId !== 'number' || !Number.isSafeInteger(resourceId) || resourceId <= 0) {
        throw new BadRequestException('Invalid resource identifier');
      }
      return { topic, resourceId };
    }
    if (
      ['billing', 'messaging', 'notifications', 'supervision'].includes(topic as string) &&
      resourceId === undefined
    ) {
      return { topic } as LiveSubscription;
    }
    throw new BadRequestException('Unsupported topic');
  }

  async existingResourceIds(subscriptions: Iterable<LiveSubscription>): Promise<ReadonlySet<number>> {
    const ids = [...new Set([...subscriptions].flatMap((s) => (s.resourceId === undefined ? [] : [s.resourceId])))];
    if (!ids.length) return new Set();
    const resources = await this.resources.find({ where: { id: In(ids) }, select: { id: true } });
    return new Set(resources.map((resource) => resource.id));
  }

  authorize(subscription: LiveSubscription, user: AuthenticatedUser, resourceIds: ReadonlySet<number>): void {
    if (subscription.topic === 'flow-logs' && !user.effectivePermissions?.has('resources.update')) {
      throw new ForbiddenException('Resource update permission required');
    }
    // Supervision is scoped to this session's user, just like the legacy endpoint:
    // only requests explicitly addressed to this supervisor are ever emitted.
    if (subscription.resourceId !== undefined && !resourceIds.has(subscription.resourceId)) {
      throw new NotFoundException('Resource not found');
    }
  }

  async source(subscription: LiveSubscription, user: AuthenticatedUser): Promise<Observable<{ data: object }>> {
    const userId = user.id;
    switch (subscription.topic) {
      case 'resource':
        return this.resourceEvents.subscribeResource(subscription.resourceId);
      case 'flow-logs':
        return defer(() => this.flowLogs.subjectFor(subscription.resourceId).asObservable()).pipe(
          finalize(() => this.flowLogs.releaseSubject(subscription.resourceId)),
        );
      case 'billing':
        return defer(() => this.billing.getTransactionSubject(userId).asObservable()).pipe(
          finalize(() => this.billing.deleteSubjectIfUnobserved(userId)),
        );
      case 'messaging':
        return this.messaging.trackPresence(
          userId,
          defer(() => this.messaging.getUserMessageSubject(userId).asObservable()),
        );
      case 'notifications':
        return defer(() => this.notifications.getUserSubject(userId).asObservable()).pipe(
          finalize(() => this.notifications.deleteSubjectIfUnobserved(userId)),
        );
      case 'supervision':
        return defer(() => this.supervision.getSupervisorSubject(userId).asObservable()).pipe(
          finalize(() => this.supervision.deleteSubjectIfUnobserved(userId)),
        );
    }
  }
}
