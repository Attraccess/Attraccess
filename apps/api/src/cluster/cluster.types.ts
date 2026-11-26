/**
 * What lets several API instances share per-process features (ATT-1163). With Valkey every part is backed by it;
 * without Valkey one instance is the whole cluster and every part is an in-process stand-in.
 */

export type BusHandler = (payload: unknown, from: string) => void | Promise<void>;
export type BusRequestHandler = (payload: unknown, from: string) => unknown;

/** Messages between API instances. Pub/sub is fire-and-forget: a message published during a reconnect is lost. */
export interface ClusterBus {
  /** Runs `handler` for messages of `type` from other instances (and addressed to this one). One handler per type. */
  on(type: string, handler: BusHandler): void;
  /** Answers requests of `type`; what it returns (or throws) goes back to the caller. One handler per type. */
  handle(type: string, handler: BusRequestHandler): void;
  /** To every other instance; never to this one. Never throws (a lost broadcast is logged). */
  broadcast(type: string, payload: unknown): Promise<void>;
  /** To one instance; to this one it runs the handler directly. Never throws. */
  send(instanceId: string, type: string, payload: unknown): Promise<void>;
  /**
   * Asks one instance and waits for its answer. Errors thrown there come back as their own class where it matters
   * (HTTP exceptions, `PluginBleError`). Rejects with `ClusterRequestTimeoutError` after `timeoutMs`, and with
   * `ClusterInstanceGoneError` when the instance's heartbeat lapses first.
   */
  request<T>(instanceId: string, type: string, payload: unknown, timeoutMs: number): Promise<T>;
}

export interface ClusterInstances {
  /** Unique per process start: `host:port|uuid`. */
  readonly id: string;
  /** The instances whose heartbeat is current, this one included. */
  live(): Promise<string[]>;
  isAlive(instanceId: string): Promise<boolean>;
  /**
   * Runs once per gone instance, on exactly one surviving instance, after its heartbeat lapsed (crash, kill). A
   * graceful shutdown lets the heartbeat lapse the same way.
   */
  onGone(handler: (instanceId: string) => Promise<void> | void): void;
}

export interface ReaderHolder {
  instanceId: string;
  /** Newest connection of the reader on that instance (ms). */
  connectedAt: number;
}

/** Which instance holds a websocket of which reader. */
export interface ReaderPresence {
  /** A socket of the reader signed in on this instance. */
  socketConnected(readerId: number, socketId: string): void;
  /** That socket closed or changed identity. */
  socketDisconnected(readerId: number, socketId: string): void;
  /** Instances holding the reader, newest connection first. Without Valkey: this instance or nobody. */
  holders(readerId: number): Promise<ReaderHolder[]>;
  /** Runs on the instance that cleaned up a gone instance, for each reader that no instance holds any more. */
  onReaderLost(handler: (readerId: number) => Promise<void> | void): void;
  /**
   * Runs on the instance that cleaned up a gone instance, for each of its readers that another instance holds now
   * (it reconnected there before the cleanup): flows armed through the gone instance's socket are gone with it.
   */
  onReaderMoved(handler: (readerId: number) => Promise<void> | void): void;
  /** Runs on every instance when a reader signs in anywhere, with the holding instance. */
  onReaderConnected(handler: (readerId: number, instanceId: string) => void): void;
}

/**
 * One flow at a time owns a reader's screen or card flow, cluster-wide. The claim value names the flow
 * (`mass-introduction:<id>`, …): any instance that knows the flow can release it, and an expired TTL frees the
 * reader of a holder that crashed.
 */
export interface ReaderScreenClaims {
  /** True when the claim was taken (or already belonged to `owner`). Without Valkey: always true. */
  claim(readerId: number, owner: string, ttlMs: number): Promise<boolean>;
  /** Extends the claim while `owner` holds it. */
  extend(readerId: number, owner: string, ttlMs: number): Promise<boolean>;
  /** Compare-and-delete: only `owner` releases. Never throws. */
  release(readerId: number, owner: string): Promise<void>;
  /** The current owner, or null. Without Valkey: null. */
  owner(readerId: number): Promise<string | null>;
  /** Releases whatever holds the reader (it is gone) and returns that owner. */
  forceRelease(readerId: number): Promise<string | null>;
}

/** Deadlines that fire exactly once cluster-wide, on whichever instance sweeps them first. */
export interface ClusterDeadlines {
  schedule(queue: string, itemId: string, atMs: number): Promise<void>;
  cancel(queue: string, itemId: string): Promise<void>;
  onDue(queue: string, handler: (itemId: string) => Promise<void> | void): void;
}
