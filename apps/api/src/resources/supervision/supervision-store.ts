import type Redis from 'ioredis';
import type { UsageSession } from '@attraccess/application-models';
import { valkeyCall } from '../../cluster/valkey-call';
import type { SerializedClusterError } from '../../cluster/cluster-errors';
import type { StartUsageSessionDto } from '../usage/dtos/startUsageSession.dto';
import type { SupervisionUser } from './supervision.types';

/** A pending request as every API instance sees it: plain data. Promises and callbacks stay with `originInstance`. */
export interface StoredSupervisionRequest {
  id: string;
  resourceId: number;
  requester: SupervisionUser;
  supervisorUserId: number | null;
  eligibleSupervisorIds: number[];
  dto: StartUsageSessionDto;
  canAskDuration: boolean;
  createdAt: number;
  expiresAt: number;
  /** The reader armed from the web for it (ATT-816). */
  readerId?: number;
  /** The instance holding the requester's blocked call or the reader's callbacks. */
  originInstance: string;
}

/** How a request ended, as it travels to the instance that holds its waiter. */
export type SupervisionOutcome =
  | {
      kind: 'resolved';
      session: UsageSession;
      supervisor: { id: number; username: string; displayName: string };
    }
  | { kind: 'failed'; error: SerializedClusterError; notifyReader: boolean };

/**
 * Pending supervision requests: in this process (one API instance) or in Valkey (several, ATT-1163). `claim` takes
 * a request out of pending in one atomic step, so approve, reject, expiry, abort, cancel and card settle each find
 * it at most once between them: a request settles at most once and starts at most one session.
 */
export interface SupervisionStore {
  create(request: StoredSupervisionRequest): Promise<void>;
  get(requestId: string): Promise<StoredSupervisionRequest | null>;
  listPending(): Promise<StoredSupervisionRequest[]>;
  claim(requestId: string): Promise<StoredSupervisionRequest | null>;
  /** One reader request per requester at a time; false when they already have one. */
  reserveReaderRequest(requesterId: number, requestId: string, ttlMs: number): Promise<boolean>;
  releaseReaderRequest(requesterId: number, requestId: string): Promise<void>;
  /** Kept a little, so the waiting instance can look it up when the message carrying it was lost. */
  recordOutcome(requestId: string, outcome: SupervisionOutcome): Promise<void>;
  outcome(requestId: string): Promise<SupervisionOutcome | null>;
}

/** One API instance: a map, changed before the first await of each method, so callers see changes at once. */
export class InMemorySupervisionStore implements SupervisionStore {
  private readonly pending = new Map<string, StoredSupervisionRequest>();
  private readonly readerRequests = new Map<number, string>();

  async create(request: StoredSupervisionRequest): Promise<void> {
    this.pending.set(request.id, request);
  }

  async get(requestId: string): Promise<StoredSupervisionRequest | null> {
    return this.pending.get(requestId) ?? null;
  }

  async listPending(): Promise<StoredSupervisionRequest[]> {
    return Array.from(this.pending.values());
  }

  async claim(requestId: string): Promise<StoredSupervisionRequest | null> {
    const request = this.pending.get(requestId);
    if (!request) return null;
    this.pending.delete(requestId);
    return request;
  }

  async reserveReaderRequest(requesterId: number, requestId: string): Promise<boolean> {
    if (this.readerRequests.has(requesterId)) return false;
    this.readerRequests.set(requesterId, requestId);
    return true;
  }

  async releaseReaderRequest(requesterId: number, requestId: string): Promise<void> {
    if (this.readerRequests.get(requesterId) === requestId) this.readerRequests.delete(requesterId);
  }

  async recordOutcome(): Promise<void> {
    // The waiter is in this process and was settled directly.
  }

  async outcome(): Promise<SupervisionOutcome | null> {
    return null;
  }
}

const PREFIX = 'attraccess:supervision:';
const requestKey = (id: string) => `${PREFIX}request:${id}`;
const PENDING_KEY = `${PREFIX}pending`;
const outcomeKey = (id: string) => `${PREFIX}outcome:${id}`;
const readerRequestKey = (requesterId: number) => `${PREFIX}requester-reader:${requesterId}`;
const KEY_GRACE_MS = 30_000;
const OUTCOME_TTL_MS = 120_000;

/** Takes the request out of pending; only one caller gets it. */
export const CLAIM_REQUEST_SCRIPT = `local v = redis.call('get', KEYS[1])
if not v then return false end
redis.call('del', KEYS[1])
redis.call('zrem', KEYS[2], ARGV[1])
return v`;
const RELEASE_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

type StoreClient = Pick<
  Redis,
  'status' | 'set' | 'get' | 'eval' | 'zadd' | 'zrangebyscore' | 'zremrangebyscore' | 'mget'
>;

/**
 * JSON for Valkey. The requester is the signed-in user, whose `effectivePermissions` is a Set (JSON would make it
 * `{}`): it travels as an array and is a Set again when read, so permission checks on another instance see it.
 */
export function encodeRequest(request: StoredSupervisionRequest): string {
  const requester = request.requester as SupervisionUser & { effectivePermissions?: unknown };
  const permissions = requester.effectivePermissions;
  return JSON.stringify({
    ...request,
    requester: permissions instanceof Set ? { ...requester, effectivePermissions: [...permissions] } : requester,
  });
}

export function decodeRequest(raw: string): StoredSupervisionRequest {
  const request = JSON.parse(raw) as StoredSupervisionRequest;
  const requester = request.requester as SupervisionUser & { effectivePermissions?: unknown };
  if (Array.isArray(requester.effectivePermissions)) {
    requester.effectivePermissions = new Set(requester.effectivePermissions as string[]);
  }
  return request;
}

/** Several API instances (ATT-1163): requests in Valkey, with a pending index scored by expiry. */
export class ValkeySupervisionStore implements SupervisionStore {
  constructor(private readonly client: StoreClient) {}

  async create(request: StoredSupervisionRequest): Promise<void> {
    const ttl = Math.max(1, request.expiresAt - Date.now() + KEY_GRACE_MS);
    await this.call(async () => {
      await this.client.set(requestKey(request.id), encodeRequest(request), 'PX', ttl);
      await this.client.zadd(PENDING_KEY, request.expiresAt, request.id);
    });
  }

  async get(requestId: string): Promise<StoredSupervisionRequest | null> {
    const raw = await this.call(() => this.client.get(requestKey(requestId)));
    return raw ? decodeRequest(raw) : null;
  }

  async listPending(): Promise<StoredSupervisionRequest[]> {
    // Ids whose request lapsed long ago are dropped; the expiry sweep settles the recent ones.
    await this.call(() => this.client.zremrangebyscore(PENDING_KEY, '-inf', Date.now() - KEY_GRACE_MS));
    const ids = await this.call(() => this.client.zrangebyscore(PENDING_KEY, '-inf', '+inf'));
    if (ids.length === 0) return [];
    const raws = await this.call(() => this.client.mget(...ids.map(requestKey)));
    return raws.flatMap((raw) => (raw ? [decodeRequest(raw)] : []));
  }

  async claim(requestId: string): Promise<StoredSupervisionRequest | null> {
    const raw = await this.call(() =>
      this.client.eval(CLAIM_REQUEST_SCRIPT, 2, requestKey(requestId), PENDING_KEY, requestId),
    );
    return raw ? decodeRequest(raw as string) : null;
  }

  async reserveReaderRequest(requesterId: number, requestId: string, ttlMs: number): Promise<boolean> {
    return (
      (await this.call(() => this.client.set(readerRequestKey(requesterId), requestId, 'PX', ttlMs, 'NX'))) === 'OK'
    );
  }

  async releaseReaderRequest(requesterId: number, requestId: string): Promise<void> {
    await this.call(() => this.client.eval(RELEASE_SCRIPT, 1, readerRequestKey(requesterId), requestId)).catch(
      () => undefined, // lapses with its TTL
    );
  }

  async recordOutcome(requestId: string, outcome: SupervisionOutcome): Promise<void> {
    await this.call(() => this.client.set(outcomeKey(requestId), JSON.stringify(outcome), 'PX', OUTCOME_TTL_MS));
  }

  async outcome(requestId: string): Promise<SupervisionOutcome | null> {
    const raw = await this.call(() => this.client.get(outcomeKey(requestId)));
    return raw ? (JSON.parse(raw) as SupervisionOutcome) : null;
  }

  private call<T>(command: () => Promise<T>): Promise<T> {
    return valkeyCall(this.client, command);
  }
}
