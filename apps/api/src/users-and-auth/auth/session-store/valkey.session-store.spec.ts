import type { Redis } from 'ioredis';
import type { Repository } from 'typeorm';
import type { User } from '@attraccess/database-entities';
import type { TokenHashService } from '../../../encryption/token-hash.service';
import { ValkeySessionStore } from './valkey.session-store';
const now = new Date('2026-09-22T10:00:00Z');
const active = {
  userId: '7',
  expiresAt: '2026-09-22T11:00:00Z',
  createdAt: '2026-09-22T09:00:00Z',
  userAgent: 'fixture',
  ipAddress: '192.0.2.7',
};
describe('ValkeySessionStore', () => {
  const client = {
    eval: jest.fn(),
    srem: jest.fn(),
    hgetall: jest.fn(),
    hget: jest.fn(),
    smembers: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(),
    scan: jest.fn(),
  };
  const users = { findOne: jest.fn() },
    hash = { hashToken: jest.fn((token: string) => `hashed-${token}`) };
  const store = new ValkeySessionStore(
    client as unknown as Redis,
    users as unknown as Repository<User>,
    hash as unknown as TokenHashService,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(now);
  });
  afterEach(() => jest.useRealTimers());
  it('lists only active sessions with metadata and orders the newest expiry first', async () => {
    client.smembers.mockResolvedValue(['missing', 'expired', 'older', 'newer']);
    client.hgetall
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ ...active, expiresAt: '2026-09-22T09:30:00Z' })
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce({ ...active, expiresAt: '2026-09-22T12:00:00Z', userAgent: '', ipAddress: '' });
    const sessions = await store.getUserSessions(7);
    expect(sessions.map(({ token }) => token)).toEqual(['newer', 'older']);
    expect(sessions[0]).toMatchObject({ userId: 7, userAgent: null, ipAddress: null });
    expect(sessions[1]).toMatchObject({
      userAgent: 'fixture',
      ipAddress: '192.0.2.7',
      createdAt: new Date(active.createdAt),
    });
  });
  it('uses one atomic store operation for account revocation and reports its count', async () => {
    client.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    expect(await store.revokeAllUserSessions(7)).toBe(1);
    expect(await store.revokeAllUserSessions(7)).toBe(0);
    expect(client.eval).toHaveBeenCalledWith(expect.any(String), 1, 'user_sessions:7', now.getTime());
  });
  it('validates hashed tokens, removes expired entries, and loads the matching user', async () => {
    client.hgetall
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ ...active, expiresAt: '2026-09-22T09:00:00Z' })
      .mockResolvedValueOnce(active);
    expect(await store.validateSession('missing')).toBeNull();
    expect(await store.validateSession('expired')).toBeNull();
    expect(client.del).toHaveBeenCalledWith('session:hashed-expired');
    users.findOne.mockResolvedValue({ id: 7 });
    expect(await store.validateSession('live')).toEqual({ id: 7 });
    expect(client.expire).toHaveBeenCalledWith('session:hashed-live', 3600);
    expect(users.findOne).toHaveBeenCalledWith({ where: { id: 7 } });
  });
  it('delegates rotation to one atomic store operation', async () => {
    client.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const expiry = new Date('2026-09-22T12:00:00Z');
    expect(await store.rotateSession('old', 'new-hash', expiry)).toBe(true);
    expect(await store.rotateSession('old', 'cannot-revive', expiry)).toBe(false);
    expect(client.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      'session:hashed-old',
      'session:new-hash',
      now.getTime(),
      'hashed-old',
      'new-hash',
      expiry.getTime(),
      expiry.toISOString(),
    );
  });
});
