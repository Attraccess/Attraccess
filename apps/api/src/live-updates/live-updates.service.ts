import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { LivePacket, LiveSubscription, liveSubscriptionKey } from '@attraccess/shared';
import { Observable, Subscriber, Subscription } from 'rxjs';
import { SseInstrumentation } from '../metrics/instrumentation/sse/sse.helper';
import { LiveTopicsService } from './live-topics.service';

interface Connection {
  id: string;
  userId: number;
  tokenId: string;
  subscriber: Subscriber<{ data: LivePacket }>;
  topics: Map<string, Subscription>;
  expiresAt: number;
  revision: number;
  queue: Promise<unknown>;
}

@Injectable()
export class LiveUpdatesService implements OnModuleDestroy {
  private readonly connections = new Map<string, Connection>();

  constructor(
    private readonly topics: LiveTopicsService,
    private readonly metrics: SseInstrumentation,
  ) {}

  open(id: string, user: AuthenticatedUser): Observable<{ data: LivePacket }> {
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) {
      throw new BadRequestException('Invalid connection identifier');
    }
    if (this.connections.has(id)) throw new BadRequestException('Connection already open');
    return new Observable((subscriber) => {
      const connection: Connection = {
        id,
        userId: user.id,
        tokenId: user.jwtTokenId,
        subscriber,
        topics: new Map(),
        expiresAt: Date.now() + 30_000,
        revision: -1,
        queue: Promise.resolve(),
      };
      this.connections.set(id, connection);
      subscriber.next({ data: { type: 'ready' } });
      const heartbeat = setInterval(() => {
        if (Date.now() >= connection.expiresAt) subscriber.complete();
        else subscriber.next({ data: { type: 'heartbeat' } });
      }, 10_000);
      return () => {
        clearInterval(heartbeat);
        this.topics.setWebPresence(connection.userId, connection.id, false);
        connection.topics.forEach((sub) => sub.unsubscribe());
        connection.topics.clear();
        if (this.connections.get(id) === connection) this.connections.delete(id);
      };
    });
  }

  update(id: string, user: AuthenticatedUser, body: unknown): Promise<void> {
    const connection = this.connections.get(id);
    if (!connection) throw new NotFoundException('Live connection not found');
    if (connection.userId !== user.id || connection.tokenId !== user.jwtTokenId) {
      throw new ForbiddenException('Live connection belongs to another session');
    }
    const value = body as { revision?: unknown; subscriptions?: unknown; present?: unknown };
    if (
      !value ||
      !Number.isSafeInteger(value.revision) ||
      (value.revision as number) < 0 ||
      (value.present !== undefined && typeof value.present !== 'boolean') ||
      !Array.isArray(value.subscriptions) ||
      value.subscriptions.length > 256
    ) {
      throw new BadRequestException('Invalid subscription set');
    }
    // Serialize updates; revisions make stale requests harmless. Lease renewals
    // use the same revision and revalidate authorization, including revoked roles.
    const update = connection.queue.then(() =>
      this.apply(
        connection,
        user,
        value.revision as number,
        value.subscriptions as unknown[],
        value.present as boolean | undefined,
      ),
    );
    connection.queue = update.catch(() => undefined);
    return update;
  }

  private async apply(
    connection: Connection,
    user: AuthenticatedUser,
    revision: number,
    values: unknown[],
    present?: boolean,
  ): Promise<void> {
    if (connection.subscriber.closed || revision < connection.revision) return;
    connection.revision = revision;
    const wanted = new Map<string, LiveSubscription>();
    for (const value of values) {
      try {
        const subscription = this.topics.parse(value);
        wanted.set(liveSubscriptionKey(subscription), subscription);
      } catch (error) {
        connection.subscriber.next({ data: { type: 'rejected', subscription: value, reason: error.message } });
      }
    }
    // One lookup per set/renewal, including when resource and flow-log topics
    // reference the same ID. Session permissions are still checked each time.
    const resourceIds = await this.topics.existingResourceIds(wanted.values());
    if (connection.subscriber.closed) return;
    for (const [key, subscription] of wanted) {
      try {
        this.topics.authorize(subscription, user, resourceIds);
      } catch (error) {
        wanted.delete(key);
        connection.subscriber.next({ data: { type: 'rejected', subscription, reason: error.message } });
      }
    }
    for (const [key, sub] of connection.topics) {
      if (!wanted.has(key)) {
        sub.unsubscribe();
        connection.topics.delete(key);
      }
    }
    for (const [key, subscription] of wanted) {
      if (connection.topics.has(key)) continue;
      try {
        const source = await this.topics.source(subscription, user);
        if (connection.subscriber.closed) return;
        const sub = this.metrics.wrapTopic(subscription.topic, source).subscribe({
          next: ({ data }) => {
            if ('keepalive' in data) return;
            const eventType =
              'eventType' in data ? String(data.eventType) : 'type' in data ? String(data.type) : 'update';
            connection.subscriber.next({
              data: { type: 'event', event: { ...subscription, eventType, payload: data } },
            });
          },
          error: () => {
            connection.topics.delete(key);
            if (subscription.topic === 'notifications') this.topics.setWebPresence(user.id, connection.id, false);
            connection.subscriber.next({ data: { type: 'rejected', subscription, reason: 'Topic unavailable' } });
          },
          complete: () => {
            connection.topics.delete(key);
            if (subscription.topic === 'notifications') this.topics.setWebPresence(user.id, connection.id, false);
          },
        });
        if (!sub.closed) connection.topics.set(key, sub);
      } catch (error) {
        connection.subscriber.next({ data: { type: 'rejected', subscription, reason: error.message } });
      }
    }
    const notifications = connection.topics.get('notifications:');
    if (!notifications || notifications.closed) this.topics.setWebPresence(user.id, connection.id, false);
    else if (present !== undefined) this.topics.setWebPresence(user.id, connection.id, present);
    connection.expiresAt = Date.now() + 30_000;
  }

  onModuleDestroy(): void {
    this.connections.forEach((connection) => connection.subscriber.complete());
  }
}
