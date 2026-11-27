import { ConflictException, HttpException, Injectable, Optional } from '@nestjs/common';
import { ClusterService } from '../../cluster/cluster.service';
import { WebsocketService } from './websocket.service';
import type { AuthenticatedWebSocket } from './websocket.types';

/** `value` when `ok`, `error` otherwise. */
export interface HolderOutcome<R> {
  instanceId: string;
  ok: boolean;
  value?: R;
  error?: Error;
}

/**
 * Reaches a reader wherever its websocket is (ATT-1163). Work for a reader runs on every instance holding a socket
 * of it, newest connection first: in process for this instance's own sockets (the path a single instance always
 * took), over the cluster bus for the others, where the handler registered with {@link handle} runs the same local
 * logic. Without Valkey only this instance's sockets exist.
 */
@Injectable()
export class ReaderRouter {
  readonly cluster: ClusterService;

  constructor(
    private readonly websocketService: WebsocketService,
    @Optional() cluster?: ClusterService,
  ) {
    this.cluster = cluster ?? ClusterService.local();
  }

  get instanceId(): string {
    return this.cluster.instanceId;
  }

  /** This instance's open sockets of the reader. */
  localSockets(readerId: number): AuthenticatedWebSocket[] {
    return Array.from(this.websocketService.sockets.values()).filter((socket) => socket.readerId === readerId);
  }

  /**
   * The instances holding the reader, newest connection first. With Valkey this reads the presence registry and
   * throws when Valkey is unreachable (callers answer 503); this instance's own sockets always count.
   */
  async holders(readerId: number): Promise<string[]> {
    const local = this.localSockets(readerId).length > 0;
    if (!this.cluster.enabled) return local ? [this.instanceId] : [];
    const holders = await this.cluster.presence.holders(readerId);
    const ids = holders.map((holder) => holder.instanceId);
    if (local && !ids.includes(this.instanceId)) ids.unshift(this.instanceId);
    if (!local) return ids.filter((id) => id !== this.instanceId);
    return ids;
  }

  /** Answers `type` requests from other instances with this instance's local logic. */
  handle<P, R>(type: string, local: (payload: P) => Promise<R> | R): void {
    this.cluster.bus.handle(type, (payload) => local(payload as P));
  }

  /** Runs on every instance for `type` broadcasts from other instances. */
  on<P>(type: string, local: (payload: P, from: string) => Promise<void> | void): void {
    this.cluster.bus.on(type, (payload, from) => local(payload as P, from));
  }

  /**
   * Runs the work on each holder: `local()` here, the registered `type` handler elsewhere. Settles every holder;
   * the outcomes keep the holders' order (newest connection first).
   */
  async onHolders<R>(
    holders: string[],
    work: { type: string; payload: unknown; local: () => Promise<R>; timeoutMs: number },
  ): Promise<HolderOutcome<R>[]> {
    return Promise.all(
      holders.map(async (instanceId): Promise<HolderOutcome<R>> => {
        try {
          const value =
            instanceId === this.instanceId
              ? await work.local()
              : await this.cluster.bus.request<R>(instanceId, work.type, work.payload, work.timeoutMs);
          return { instanceId, ok: true, value };
        } catch (error) {
          return { instanceId, ok: false, error: error as Error };
        }
      }),
    );
  }

  /** Runs `local` here and broadcasts `type` so every other instance runs its handler for its own sockets. */
  everywhere<P, R>(type: string, payload: P, local: () => R): R {
    if (this.cluster.enabled) void this.cluster.bus.broadcast(type, payload);
    return local();
  }
}

/**
 * Why no holder armed the reader: a busy holder wins (the caller gets the usual 409), then the newest holder's HTTP
 * error, else `fallback`.
 */
export function armFailure(outcomes: HolderOutcome<unknown>[], fallback: Error): Error {
  const errors = outcomes.flatMap((outcome) => (outcome.ok ? [] : [outcome.error]));
  return (
    errors.find((error) => error instanceof ConflictException) ??
    errors.find((error) => error instanceof HttpException) ??
    fallback
  );
}
