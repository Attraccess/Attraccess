import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { describeValkeyError, logValkeyOutages } from '../valkey/valkey-outage-logging';
import type { BusHandler, BusRequestHandler, ClusterBus } from './cluster.types';
import {
  ClusterInstanceGoneError,
  ClusterRequestTimeoutError,
  deserializeClusterError,
  serializeClusterError,
  type SerializedClusterError,
} from './cluster-errors';
import { valkeyCall } from './valkey-call';

const BROADCAST_CHANNEL = 'attraccess:cluster:bus';
const instanceChannel = (id: string) => `attraccess:cluster:bus:${id}`;
/** Pending requests to an instance whose heartbeat lapsed fail this often, instead of waiting for their timeout. */
const CHECK_TARGETS_EVERY_MS = 2_000;

interface Envelope {
  v: 1;
  from: string;
  type: string;
  payload?: unknown;
  /** Request correlation id; with `reply` this is an answer. */
  rid?: string;
  reply?: true;
  error?: SerializedClusterError;
}

interface PendingRequest {
  target: string;
  type: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/** Runs handlers registered for this instance. Shared by both buses: a message to oneself never leaves the process. */
class HandlerRegistry {
  readonly logger = new Logger('ClusterBus');
  private readonly handlers = new Map<string, BusHandler>();
  private readonly requestHandlers = new Map<string, BusRequestHandler>();

  constructor(readonly instanceId: string) {}

  on(type: string, handler: BusHandler): void {
    this.handlers.set(type, handler);
  }

  handle(type: string, handler: BusRequestHandler): void {
    this.requestHandlers.set(type, handler);
  }

  async deliver(type: string, payload: unknown, from: string): Promise<void> {
    const handler = this.handlers.get(type);
    if (!handler) return;
    try {
      await handler(payload, from);
    } catch (error) {
      this.logger.error(`Cluster message ${type} from ${from} failed: ${(error as Error).message}`);
    }
  }

  async answer(type: string, payload: unknown, from: string): Promise<unknown> {
    const handler = this.requestHandlers.get(type);
    if (!handler) throw new Error(`No handler for cluster request ${type}`);
    return handler(payload, from);
  }
}

/** One instance: messages to itself run in process, there is nobody to broadcast to. */
export class LocalClusterBus implements ClusterBus {
  private readonly registry: HandlerRegistry;

  constructor(readonly instanceId: string) {
    this.registry = new HandlerRegistry(instanceId);
  }

  on(type: string, handler: BusHandler): void {
    this.registry.on(type, handler);
  }

  handle(type: string, handler: BusRequestHandler): void {
    this.registry.handle(type, handler);
  }

  async broadcast(): Promise<void> {
    // No other instance.
  }

  async send(instanceId: string, type: string, payload: unknown): Promise<void> {
    if (instanceId === this.instanceId) await this.registry.deliver(type, payload, this.instanceId);
  }

  async request<T>(instanceId: string, type: string, payload: unknown): Promise<T> {
    if (instanceId !== this.instanceId) throw new ClusterInstanceGoneError(instanceId);
    return (await this.registry.answer(type, payload, this.instanceId)) as T;
  }
}

type BusClient = Pick<Redis, 'status' | 'publish' | 'duplicate'>;

/**
 * Valkey pub/sub: one broadcast channel and one channel per instance, on a dedicated subscriber connection that
 * subscribes again after every reconnect (as the authorization cache does).
 */
export class ValkeyClusterBus implements ClusterBus {
  private readonly registry: HandlerRegistry;
  private readonly logger: Logger;
  private subscriber: Redis | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private subscribed: Promise<void> = Promise.resolve();
  private targetCheck: NodeJS.Timeout | null = null;

  constructor(
    private readonly client: BusClient,
    readonly instanceId: string,
    private readonly isAlive: (instanceId: string) => Promise<boolean>,
  ) {
    this.registry = new HandlerRegistry(instanceId);
    this.logger = this.registry.logger;
  }

  on(type: string, handler: BusHandler): void {
    this.registry.on(type, handler);
  }

  handle(type: string, handler: BusRequestHandler): void {
    this.registry.handle(type, handler);
  }

  /** Resolves once both channels are subscribed (tests wait for it before publishing). */
  whenSubscribed(): Promise<void> {
    return this.subscribed;
  }

  start(): void {
    // Without a retry limit SUBSCRIBE waits until Valkey is reachable instead of failing for good at startup.
    const subscriber = this.client.duplicate({ maxRetriesPerRequest: null, commandTimeout: undefined });
    this.subscriber = subscriber;
    logValkeyOutages(subscriber, this.logger, {
      lost: (reason) =>
        `Cluster bus lost its Valkey connection (${reason}); messages from other API instances are missed until it reconnects`,
      reconnected: 'Cluster bus reconnected to Valkey',
    });
    subscriber.on('message', (_channel: string, raw: string) => this.onMessage(raw));
    this.subscribed = this.subscribe(subscriber);
    this.targetCheck = setInterval(() => void this.failRequestsToGoneInstances(), CHECK_TARGETS_EVERY_MS);
    this.targetCheck.unref?.();
  }

  stop(): void {
    if (this.targetCheck) clearInterval(this.targetCheck);
    this.targetCheck = null;
    this.subscriber?.disconnect();
    this.subscriber = null;
    for (const [rid, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new ClusterInstanceGoneError(pending.target));
      this.pending.delete(rid);
    }
  }

  async broadcast(type: string, payload: unknown): Promise<void> {
    await this.publish(BROADCAST_CHANNEL, { v: 1, from: this.instanceId, type, payload });
  }

  async send(instanceId: string, type: string, payload: unknown): Promise<void> {
    if (instanceId === this.instanceId) return this.registry.deliver(type, payload, this.instanceId);
    await this.publish(instanceChannel(instanceId), { v: 1, from: this.instanceId, type, payload });
  }

  async request<T>(instanceId: string, type: string, payload: unknown, timeoutMs: number): Promise<T> {
    if (instanceId === this.instanceId) return (await this.registry.answer(type, payload, this.instanceId)) as T;
    const rid = randomUUID();
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(rid);
        reject(new ClusterRequestTimeoutError(type, instanceId));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(rid, { target: instanceId, type, resolve, reject, timer });
    });
    try {
      await valkeyCall(this.client, () =>
        this.client.publish(
          instanceChannel(instanceId),
          JSON.stringify({ v: 1, from: this.instanceId, type, payload, rid } satisfies Envelope),
        ),
      );
    } catch (error) {
      const pending = this.pending.get(rid);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(rid);
      }
      result.catch(() => undefined);
      throw error;
    }
    return (await result) as T;
  }

  private async subscribe(subscriber: Redis): Promise<void> {
    try {
      await subscriber.subscribe(BROADCAST_CHANNEL, instanceChannel(this.instanceId));
    } catch (error) {
      if (subscriber !== this.subscriber) return;
      this.logger.warn(
        `Could not subscribe to the cluster bus (${describeValkeyError(error)}); trying again after the next reconnect`,
      );
      await new Promise<void>((resolve) => subscriber.once('ready', () => resolve()));
      if (subscriber === this.subscriber) await this.subscribe(subscriber);
    }
  }

  private async publish(channel: string, envelope: Envelope): Promise<void> {
    try {
      await valkeyCall(this.client, () => this.client.publish(channel, JSON.stringify(envelope)));
    } catch (error) {
      this.logger.warn(`Cluster message ${envelope.type} was not sent: ${(error as Error).message}`);
    }
  }

  private onMessage(raw: string): void {
    let envelope: Envelope;
    try {
      envelope = JSON.parse(raw) as Envelope;
    } catch {
      this.logger.warn('Ignoring an unreadable cluster message');
      return;
    }
    if (envelope?.v !== 1 || envelope.from === this.instanceId) return;
    if (envelope.reply && envelope.rid) return this.onReply(envelope);
    if (envelope.rid) {
      void this.onRequest(envelope);
      return;
    }
    void this.registry.deliver(envelope.type, envelope.payload, envelope.from);
  }

  private onReply(envelope: Envelope): void {
    const pending = this.pending.get(envelope.rid as string);
    if (!pending) return;
    this.pending.delete(envelope.rid as string);
    clearTimeout(pending.timer);
    if (envelope.error) pending.reject(deserializeClusterError(envelope.error));
    else pending.resolve(envelope.payload);
  }

  private async onRequest(envelope: Envelope): Promise<void> {
    const reply: Envelope = { v: 1, from: this.instanceId, type: envelope.type, rid: envelope.rid, reply: true };
    try {
      reply.payload = await this.registry.answer(envelope.type, envelope.payload, envelope.from);
    } catch (error) {
      reply.error = serializeClusterError(error);
    }
    await this.publish(instanceChannel(envelope.from), reply);
  }

  private async failRequestsToGoneInstances(): Promise<void> {
    const targets = new Set([...this.pending.values()].map((pending) => pending.target));
    for (const target of targets) {
      const alive = await this.isAlive(target).catch(() => true);
      if (alive) continue;
      for (const [rid, pending] of this.pending) {
        if (pending.target !== target) continue;
        clearTimeout(pending.timer);
        this.pending.delete(rid);
        pending.reject(new ClusterInstanceGoneError(target));
      }
    }
  }
}
