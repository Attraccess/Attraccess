import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ApiTokenRecord, AuthenticatedSessionUser } from '@attraccess/application-models';
import { ApiTokenService } from './api-token.service';
import type { ApiTokenStore } from './api-token.port';

const record = (overrides: Partial<ApiTokenRecord> = {}): ApiTokenRecord => ({
  id: 1,
  userId: 3,
  name: 'Script',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  permissionKeys: ['resources.read'],
  ...overrides,
});

describe('ApiTokenService', () => {
  const store = {
    listActive: jest.fn(),
    create: jest.fn(),
    findActiveOwned: jest.fn(),
    findByHash: jest.fn(),
    update: jest.fn(),
    revoke: jest.fn(),
    touchLastUsed: jest.fn(),
  } satisfies Record<keyof ApiTokenStore, jest.Mock>;
  const users = { findSessionUser: jest.fn() };
  const tokenHashService = { hashApiToken: jest.fn((token) => `hashed:${token}`) };
  const rbacService = {
    getEffectivePermissions: jest.fn(),
    getUnavailablePermissionKeys: jest.fn(async () => new Set<string>()),
  };
  const service = new ApiTokenService(store, users, tokenHashService as never, rbacService as never);

  beforeEach(() => {
    jest.resetAllMocks();
    tokenHashService.hashApiToken.mockImplementation((token) => `hashed:${token}`);
    rbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.read']));
    rbacService.getUnavailablePermissionKeys.mockResolvedValue(new Set());
    store.create.mockImplementation(async ({ userId, name, expiresAt, permissionKeys }) =>
      record({ userId, name, expiresAt, permissionKeys }),
    );
    store.touchLastUsed.mockResolvedValue(true);
  });

  it('stores only the hash and returns the secret once on creation', async () => {
    const result = await service.create(3, { name: ' Script ', permissionKeys: ['resources.read', 'resources.read'] });

    expect(result.token).toHaveLength(43);
    expect(store.create).toHaveBeenCalledWith({
      userId: 3,
      name: 'Script',
      tokenHash: `hashed:${result.token}`,
      expiresAt: null,
      permissionKeys: ['resources.read'],
    });
    expect(JSON.stringify(result.apiToken)).not.toContain(result.token);
    expect(result.apiToken).not.toHaveProperty('token');
    expect(result.apiToken).not.toHaveProperty('tokenHash');
  });

  it('rejects an expiry in the past without storing anything', async () => {
    await expect(
      service.create(3, { name: 'Script', permissionKeys: [], expiresAt: new Date(Date.now() - 1000) }),
    ).rejects.toThrow(BadRequestException);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('replaces permissions and token metadata through one store update', async () => {
    store.findActiveOwned.mockResolvedValue(record({ name: 'Old' }));
    store.update.mockResolvedValue(record({ name: 'New' }));

    await expect(service.update(3, 1, { name: ' New ', permissionKeys: ['resources.read'] })).resolves.toMatchObject({
      name: 'New',
    });

    expect(store.update).toHaveBeenCalledTimes(1);
    expect(store.update).toHaveBeenCalledWith(1, {
      name: 'New',
      permissionKeys: ['resources.read'],
      expiresAt: undefined,
    });
  });

  it('clears the expiry when null is given', async () => {
    store.findActiveOwned.mockResolvedValue(record({ expiresAt: new Date(Date.now() + 60_000) }));
    store.update.mockResolvedValue(record());

    await service.update(3, 1, { expiresAt: null });

    expect(store.update).toHaveBeenCalledWith(1, { name: undefined, permissionKeys: undefined, expiresAt: null });
  });

  it('refuses to change tokens that are revoked or belong to someone else', async () => {
    store.findActiveOwned.mockResolvedValue(null);

    await expect(service.update(3, 2, { name: 'x' })).rejects.toThrow(new NotFoundException('ApiTokenNotFound'));
    await expect(service.revoke(3, 2)).rejects.toThrow(new NotFoundException('ApiTokenNotFound'));
    expect(store.update).not.toHaveBeenCalled();
    expect(store.revoke).not.toHaveBeenCalled();
  });

  it('revokes an owned token', async () => {
    store.findActiveOwned.mockResolvedValue(record());

    await service.revoke(3, 1);

    expect(store.revoke).toHaveBeenCalledWith(1, expect.any(Date));
  });

  it('paginates active tokens', async () => {
    store.listActive.mockResolvedValue({ data: [], total: 12 });

    await expect(service.list(3, 2, 10)).resolves.toEqual({ data: [], total: 12, page: 2, limit: 10 });

    expect(store.listActive).toHaveBeenCalledWith(3, 2, 10);
  });

  it('refuses permissions no longer held by the owner', async () => {
    await expect(service.create(3, { name: 'Script', permissionKeys: ['resources.write'] })).rejects.toThrow(
      ForbiddenException,
    );
    expect(rbacService.getEffectivePermissions).toHaveBeenCalledWith(3, true);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('rejects unknown, revoked and expired tokens before loading their owner', async () => {
    store.findByHash.mockResolvedValueOnce(null);
    await expect(service.authenticate('secret')).resolves.toBeNull();

    store.findByHash.mockResolvedValueOnce(record({ revokedAt: new Date() }));
    await expect(service.authenticate('secret')).resolves.toBeNull();

    store.findByHash.mockResolvedValueOnce(record({ expiresAt: new Date(Date.now() - 1) }));
    await expect(service.authenticate('secret')).resolves.toBeNull();
    expect(users.findSessionUser).not.toHaveBeenCalled();
    expect(store.findByHash).toHaveBeenCalledWith('hashed:secret');
  });

  it('rejects a token when its soft-deleted owner cannot be loaded', async () => {
    store.findByHash.mockResolvedValue(record());
    users.findSessionUser.mockResolvedValue(null);

    await expect(service.authenticate('secret')).resolves.toBeNull();
  });

  it('rejects a token when its owner is disabled', async () => {
    store.findByHash.mockResolvedValue(record());
    users.findSessionUser.mockResolvedValue({ id: 3, isDisabled: true } as AuthenticatedSessionUser);

    await expect(service.authenticate('secret')).resolves.toBeNull();
    expect(store.touchLastUsed).not.toHaveBeenCalled();
  });

  it('returns the owner and the token metadata, and records the use', async () => {
    const owner = { id: 3, isDisabled: false } as AuthenticatedSessionUser;
    store.findByHash.mockResolvedValue(record());
    users.findSessionUser.mockResolvedValue(owner);

    const principal = await service.authenticate('secret');

    expect(principal).toEqual({ user: owner, apiToken: record() });
    expect(store.touchLastUsed).toHaveBeenCalledWith(1, expect.any(Date));
  });

  it('does not write the last used time again within a minute', async () => {
    store.findByHash.mockResolvedValue(record({ lastUsedAt: new Date(Date.now() - 1000) }));
    users.findSessionUser.mockResolvedValue({ id: 3, isDisabled: false } as AuthenticatedSessionUser);

    await expect(service.authenticate('secret')).resolves.not.toBeNull();

    expect(store.touchLastUsed).not.toHaveBeenCalled();
  });

  it('rejects a token revoked or expired while updating its last used time', async () => {
    store.findByHash.mockResolvedValue(record());
    users.findSessionUser.mockResolvedValue({ id: 3, isDisabled: false } as AuthenticatedSessionUser);
    store.touchLastUsed.mockResolvedValue(false);

    await expect(service.authenticate('secret')).resolves.toBeNull();
  });
});
