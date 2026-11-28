import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import type { ReaderScreenClaims } from './cluster.types';
import { valkeyCall } from './valkey-call';

const claimKey = (readerId: number) => `attraccess:cluster:reader-screen:${readerId}`;

/** Takes a free claim, or confirms one `owner` already holds (an arm retried after a lost answer). */
export const CLAIM_SCRIPT = `local v = redis.call('get', KEYS[1])
if v == false then redis.call('set', KEYS[1], ARGV[1], 'PX', ARGV[2]) return 1 end
if v == ARGV[1] then redis.call('pexpire', KEYS[1], ARGV[2]) return 1 end
return 0`;
export const EXTEND_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end`;
export const RELEASE_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;
/** GETDEL for Valkey versions and clients without it. */
const FORCE_RELEASE_SCRIPT = `local v = redis.call('get', KEYS[1]) redis.call('del', KEYS[1]) return v`;

/** One instance: the socket state of its own readers is the whole story, so every claim succeeds. */
export class LocalReaderScreenClaims implements ReaderScreenClaims {
  async claim(): Promise<boolean> {
    return true;
  }

  async extend(): Promise<boolean> {
    return true;
  }

  async release(): Promise<void> {
    // Nothing held.
  }

  async owner(): Promise<string | null> {
    return null;
  }

  async forceRelease(): Promise<string | null> {
    return null;
  }
}

export class ValkeyReaderScreenClaims implements ReaderScreenClaims {
  private readonly logger = new Logger('ReaderScreenClaims');

  constructor(private readonly client: Pick<Redis, 'status' | 'eval' | 'get'>) {}

  async claim(readerId: number, owner: string, ttlMs: number): Promise<boolean> {
    return (
      (await valkeyCall(this.client, () => this.client.eval(CLAIM_SCRIPT, 1, claimKey(readerId), owner, ttlMs))) === 1
    );
  }

  async extend(readerId: number, owner: string, ttlMs: number): Promise<boolean> {
    return (
      (await valkeyCall(this.client, () => this.client.eval(EXTEND_SCRIPT, 1, claimKey(readerId), owner, ttlMs))) === 1
    );
  }

  async release(readerId: number, owner: string): Promise<void> {
    await valkeyCall(this.client, () => this.client.eval(RELEASE_SCRIPT, 1, claimKey(readerId), owner)).catch(
      (error: Error) =>
        // The TTL frees the reader once Valkey is back.
        this.logger.warn(`Could not release reader ${readerId} from ${owner}: ${error.message}`),
    );
  }

  owner(readerId: number): Promise<string | null> {
    return valkeyCall(this.client, () => this.client.get(claimKey(readerId)));
  }

  async forceRelease(readerId: number): Promise<string | null> {
    return (await valkeyCall(this.client, () => this.client.eval(FORCE_RELEASE_SCRIPT, 1, claimKey(readerId)))) as
      string | null;
  }
}
