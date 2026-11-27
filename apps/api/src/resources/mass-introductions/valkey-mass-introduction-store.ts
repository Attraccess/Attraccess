import { ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { valkeyCall } from '../../cluster/valkey-call';
import type {
  MassIntroductionParticipant,
  MassIntroductionReader,
  MassIntroductionTarget,
} from './mass-introduction.types';
import { MassIntroductionReaderState } from './dtos/massIntroductionSession.dto';
import {
  WRONG_CODE_WINDOW_MS,
  type MassIntroductionStore,
  type StoredMassIntroduction,
} from './mass-introduction-store';

const PREFIX = 'attraccess:mass-introduction:';
const sessionKey = (id: string) => `${PREFIX}session:${id}`;
const publicKey = (publicId: string) => `${PREFIX}public:${publicId}`;
const participantsKey = (id: string) => `${PREFIX}participants:${id}`;
const introducerKey = (userId: number) => `${PREFIX}introducer:${userId}`;
const joinKey = (id: string, userId: number) => `${PREFIX}join:${id}:${userId}`;
const wrongKey = (id: string, userId: number) => `${PREFIX}wrong:${id}:${userId}`;

/** Keys outlive the deadline a little, so the expiry sweep still finds the session it ends. */
export const KEY_GRACE_MS = 60_000;
/** A join claim outlives any grant; a crashed holder's claim lapses and the user can join again. */
const JOIN_CLAIM_TTL_MS = 30_000;
const JOIN_WAIT_MS = 20_000;
const JOIN_POLL_MS = 100;

export const REMOVE_SESSION_SCRIPT = `local v = redis.call('get', KEYS[1])
if not v then return false end
local s = cjson.decode(v)
redis.call('del', KEYS[1], KEYS[2], ARGV[1] .. 'public:' .. s.publicId)
redis.call('srem', ARGV[1] .. 'introducer:' .. tostring(s.introducer.id), s.id)
return v`;

export const ATTACH_READER_SCRIPT = `local v = redis.call('get', KEYS[1])
if not v then return 0 end
local s = cjson.decode(v)
s.reader = cjson.decode(ARGV[1])
redis.call('set', KEYS[1], cjson.encode(s), 'KEEPTTL')
return 1`;

export const DETACH_READER_SCRIPT = `local v = redis.call('get', KEYS[1])
if not v then return false end
local s = cjson.decode(v)
if type(s.reader) ~= 'table' or s.reader.id ~= tonumber(ARGV[1]) or s.reader.state == ARGV[2] then return false end
s.reader.state = ARGV[2]
local encoded = cjson.encode(s)
redis.call('set', KEYS[1], encoded, 'KEEPTTL')
return encoded`;

/** Records a participant only while the session exists; the hash lives as long as the session. */
export const ADD_PARTICIPANT_SCRIPT = `local ttl = redis.call('pttl', KEYS[1])
if ttl <= 0 then return 0 end
redis.call('hset', KEYS[2], ARGV[1], ARGV[2])
redis.call('pexpire', KEYS[2], ttl)
return 1`;

/**
 * Counts a wrong code unless the limit is reached, in one step, so parallel guesses on several instances never get
 * more than the limit checked: 1 counted, 0 beyond the limit (not counted).
 */
export const COUNT_WRONG_CODE_SCRIPT = `local c = tonumber(redis.call('get', KEYS[1]) or '0')
if c >= tonumber(ARGV[2]) then return 0 end
c = redis.call('incr', KEYS[1])
if c == 1 then redis.call('pexpire', KEYS[1], ARGV[1]) end
return 1`;

const RENEW_JOIN_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end`;
const RELEASE_JOIN_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

type StoreClient = Pick<
  Redis,
  'status' | 'set' | 'get' | 'eval' | 'sadd' | 'smembers' | 'srem' | 'mget' | 'hget' | 'hgetall' | 'pexpire' | 'del'
>;

function parseSession(raw: string | null): StoredMassIntroduction | null {
  return raw ? (JSON.parse(raw) as StoredMassIntroduction) : null;
}

function parseParticipant(raw: string): MassIntroductionParticipant {
  const participant = JSON.parse(raw) as MassIntroductionParticipant & { joinedAt: string };
  return { ...participant, joinedAt: new Date(participant.joinedAt) };
}

/** Several API instances (ATT-1163): sessions, participants, join claims and wrong-code counters in Valkey. */
export class ValkeyMassIntroductionStore implements MassIntroductionStore {
  constructor(
    private readonly client: StoreClient,
    private readonly maxWrongCodes: number,
  ) {}

  async create(session: StoredMassIntroduction): Promise<void> {
    const ttl = Math.max(1, session.expiresAt - Date.now() + KEY_GRACE_MS);
    await this.call(async () => {
      await this.client.set(sessionKey(session.id), JSON.stringify(session), 'PX', ttl);
      await this.client.set(publicKey(session.publicId), session.id, 'PX', ttl);
      await this.client.sadd(introducerKey(session.introducer.id), session.id);
      await this.client.pexpire(introducerKey(session.introducer.id), ttl);
    });
  }

  async get(sessionId: string): Promise<StoredMassIntroduction | null> {
    return parseSession(await this.call(() => this.client.get(sessionKey(sessionId))));
  }

  async getByPublicId(publicId: string): Promise<StoredMassIntroduction | null> {
    const id = await this.call(() => this.client.get(publicKey(publicId)));
    return id ? this.get(id) : null;
  }

  async findForIntroducer(
    introducerId: number,
    target: Pick<MassIntroductionTarget, 'type' | 'id'>,
  ): Promise<StoredMassIntroduction[]> {
    const ids = await this.call(() => this.client.smembers(introducerKey(introducerId)));
    if (ids.length === 0) return [];
    const sessions = await this.call(() => this.client.mget(...ids.map(sessionKey)));
    return sessions
      .map(parseSession)
      .filter(
        (session): session is StoredMassIntroduction =>
          session !== null && session.target.type === target.type && session.target.id === target.id,
      );
  }

  async remove(sessionId: string): Promise<StoredMassIntroduction | null> {
    const raw = await this.call(() =>
      this.client.eval(REMOVE_SESSION_SCRIPT, 2, sessionKey(sessionId), participantsKey(sessionId), PREFIX),
    );
    return parseSession((raw as string | null) ?? null);
  }

  async attachReader(sessionId: string, reader: MassIntroductionReader): Promise<boolean> {
    const result = await this.call(() =>
      this.client.eval(ATTACH_READER_SCRIPT, 1, sessionKey(sessionId), JSON.stringify(reader)),
    );
    return result === 1;
  }

  async detachReader(sessionId: string, readerId: number): Promise<StoredMassIntroduction | null> {
    const raw = await this.call(() =>
      this.client.eval(
        DETACH_READER_SCRIPT,
        1,
        sessionKey(sessionId),
        String(readerId),
        MassIntroductionReaderState.DETACHED,
      ),
    );
    return parseSession((raw as string | null) ?? null);
  }

  async participants(sessionId: string): Promise<MassIntroductionParticipant[]> {
    const all = await this.call(() => this.client.hgetall(participantsKey(sessionId)));
    return Object.values(all)
      .map(parseParticipant)
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  }

  async participant(sessionId: string, userId: number): Promise<MassIntroductionParticipant | null> {
    const raw = await this.call(() => this.client.hget(participantsKey(sessionId), String(userId)));
    return raw ? parseParticipant(raw) : null;
  }

  async joinOnce(
    sessionId: string,
    userId: number,
    grant: () => Promise<MassIntroductionParticipant>,
  ): Promise<{ participant: MassIntroductionParticipant; added: boolean }> {
    const deadline = Date.now() + JOIN_WAIT_MS;
    for (;;) {
      const existing = await this.participant(sessionId, userId);
      if (existing) return { participant: existing, added: false };
      const token = randomUUID();
      const claimed = await this.call(() =>
        this.client.set(joinKey(sessionId, userId), token, 'PX', JOIN_CLAIM_TTL_MS, 'NX'),
      );
      if (claimed === 'OK') return this.grantClaimed(sessionId, userId, token, grant);
      if (Date.now() >= deadline) {
        throw new ServiceUnavailableException('Another join of this user is still in progress, try again');
      }
      await new Promise((resolve) => setTimeout(resolve, JOIN_POLL_MS));
    }
  }

  async wrongCodesExhausted(sessionId: string, userId: number): Promise<boolean> {
    return Number((await this.call(() => this.client.get(wrongKey(sessionId, userId)))) ?? 0) >= this.maxWrongCodes;
  }

  async countWrongCode(sessionId: string, userId: number): Promise<boolean> {
    const counted = await this.call(() =>
      this.client.eval(
        COUNT_WRONG_CODE_SCRIPT,
        1,
        wrongKey(sessionId, userId),
        WRONG_CODE_WINDOW_MS,
        this.maxWrongCodes,
      ),
    );
    return counted === 1;
  }

  async clearWrongCodes(sessionId: string, userId: number): Promise<void> {
    await this.call(() => this.client.del(wrongKey(sessionId, userId)));
  }

  private async grantClaimed(
    sessionId: string,
    userId: number,
    token: string,
    grant: () => Promise<MassIntroductionParticipant>,
  ): Promise<{ participant: MassIntroductionParticipant; added: boolean }> {
    // The winner may have recorded the participant and released its claim between our look-up and our claim.
    const recorded = await this.participant(sessionId, userId).catch(async (error: Error) => {
      await this.releaseJoin(sessionId, userId, token);
      throw error;
    });
    if (recorded) {
      await this.releaseJoin(sessionId, userId, token);
      return { participant: recorded, added: false };
    }
    // A slow grant keeps its claim, so nobody else grants the same user meanwhile.
    const renew = setInterval(
      () =>
        void this.call(() =>
          this.client.eval(RENEW_JOIN_SCRIPT, 1, joinKey(sessionId, userId), token, JOIN_CLAIM_TTL_MS),
        ).catch(() => undefined),
      JOIN_CLAIM_TTL_MS / 3,
    );
    renew.unref?.();
    try {
      const participant = await grant();
      const added = await this.call(() =>
        this.client.eval(
          ADD_PARTICIPANT_SCRIPT,
          2,
          sessionKey(sessionId),
          participantsKey(sessionId),
          String(userId),
          JSON.stringify(participant),
        ),
      );
      return { participant, added: added === 1 };
    } finally {
      clearInterval(renew);
      // The participant is recorded (or the grant failed and the user may retry): the claim has done its job.
      await this.releaseJoin(sessionId, userId, token);
    }
  }

  private async releaseJoin(sessionId: string, userId: number, token: string): Promise<void> {
    await this.call(() => this.client.eval(RELEASE_JOIN_SCRIPT, 1, joinKey(sessionId, userId), token)).catch(
      () => undefined,
    );
  }

  private call<T>(command: () => Promise<T>): Promise<T> {
    return valkeyCall(this.client, command);
  }
}
