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
import { finalize } from 'rxjs/operators';
import { Mutex } from 'async-mutex';
import { SseInstrumentation } from '../metrics/instrumentation/sse/sse.helper';
import { LiveTopicsService } from './live-topics.service';
import { LiveConnectionIdSchema, LiveSubscriptionSetSchema } from './live-updates.schemas';

interface Connection {
  id: string;
  userId: number;
  tokenId: string;
  subscriber: Subscriber<{ data: LivePacket }>;
  topics: Map<string, { subscription: LiveSubscription; observer: Subscription }>;
  expiresAt: number;
  revision: number;
  mutex: Mutex;
}

@Injectable()
export class LiveUpdatesService implements OnModuleDestroy {
  private readonly connections = new Map<string, Connection>();

  constructor(
    private readonly topics: LiveTopicsService,
    private readonly metrics: SseInstrumentation,
  ) {}

  open(id: string, user: AuthenticatedUser): Observable<{ data: LivePacket }> {
    if (!LiveConnectionIdSchema.safeParse(id).success) {
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
        mutex: new Mutex(),
      };
      this.connections.set(id, connection);
      subscriber.next({ data: { type: 'ready' } });
      const heartbeat = setInterval(() => {
        if (Date.now() >= connection.expiresAt) subscriber.complete();
        else subscriber.next({ data: { type: 'heartbeat' } });
      }, 10_000);
      return () => {
        clearInterval(heartbeat);
        connection.topics.forEach(({ observer }) => observer.unsubscribe());
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
    const parsed = LiveSubscriptionSetSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid subscription set');
    const { revision, subscriptions, present } = parsed.data;
    // Serialize updates; revisions make stale requests harmless. Lease renewals
    // use the same revision and revalidate authorization, including revoked roles.
    return connection.mutex.runExclusive(() => this.apply(connection, user, revision, subscriptions, present));
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
    // Providers validate their whole set per renewal, retaining domain-owned batching.
    const rejected = await this.topics.authorize(wanted.values(), user);
    if (connection.subscriber.closed) return;
    for (const [key, subscription] of wanted) {
      if (rejected.has(key)) {
        wanted.delete(key);
        connection.subscriber.next({ data: { type: 'rejected', subscription, reason: rejected.get(key) } });
      }
    }
    for (const [key, { observer }] of connection.topics) {
      if (!wanted.has(key)) {
        observer.unsubscribe();
        connection.topics.delete(key);
      }
    }
    for (const [key, subscription] of wanted) {
      if (connection.topics.has(key)) continue;
      try {
        const source = await this.topics.source(subscription, user);
        if (connection.subscriber.closed) return;
        const sub = this.metrics
          .wrapTopic(subscription.topic, source)
          .pipe(finalize(() => this.topics.setPresence(subscription, user.id, connection.id, false)))
          .subscribe({
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
              connection.subscriber.next({ data: { type: 'rejected', subscription, reason: 'Topic unavailable' } });
            },
            complete: () => {
              connection.topics.delete(key);
            },
          });
        if (!sub.closed) connection.topics.set(key, { subscription, observer: sub });
      } catch (error) {
        connection.subscriber.next({ data: { type: 'rejected', subscription, reason: error.message } });
      }
    }
    if (present !== undefined) {
      for (const { subscription } of connection.topics.values()) {
        this.topics.setPresence(subscription, user.id, connection.id, present);
      }
    }
    connection.expiresAt = Date.now() + 30_000;
  }

  onModuleDestroy(): void {
    this.connections.forEach((connection) => connection.subscriber.complete());
  }
}
