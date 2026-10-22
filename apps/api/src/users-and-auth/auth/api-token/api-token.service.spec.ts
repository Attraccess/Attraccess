import { ApiTokenPersistence } from '../persistence/port';
import { ForbiddenException } from '@nestjs/common';
import { ApiToken } from '@attraccess/application-models';
import { ApiTokenService } from './api-token.service';

describe('ApiTokenService', () => {
  const lookup = jest.fn();
  const persistence: jest.Mocked<ApiTokenPersistence> = {
    activePage: jest.fn(),
    findOwned: lookup,
    findByHash: lookup,
    findOwner: jest.fn(),
    createToken: jest.fn(
      async (data, keys) => ({ ...data, id: 1, createdAt: new Date(), permissionKeys: [...keys] }) as ApiToken,
    ),
    updateToken: jest.fn(async (token) => token),
    saveToken: jest.fn(),
    touchActive: jest.fn().mockResolvedValue(true),
  };
  const tokenHashService = { hashApiToken: jest.fn((token) => `hashed:${token}`) };
  const rbacService = { getEffectivePermissions: jest.fn() };
  const service = new ApiTokenService(persistence, tokenHashService as never, rbacService as never);

  beforeEach(() => {
    jest.clearAllMocks();
    rbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.read']));
  });

  it('stores only the hash and returns the secret once on creation', async () => {
    const result = await service.create(3, {
      name: 'Script',
      permissionKeys: ['resources.read'],
    });

    expect(result.token).toHaveLength(43);
    expect(persistence.createToken).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: `hashed:${result.token}` }),
      ['resources.read'],
    );
    expect(result.apiToken).not.toHaveProperty('token');
  });

  it('submits token metadata and permissions together', async () => {
    await service.create(3, { name: 'Script', permissionKeys: ['resources.read'] });

    expect(persistence.createToken).toHaveBeenCalledWith(expect.objectContaining({ userId: 3, name: 'Script' }), [
      'resources.read',
    ]);
  });

  it('submits permission and metadata changes together', async () => {
    persistence.findOwned.mockResolvedValue({
      id: 1,
      userId: 3,
      name: 'Old',
      revokedAt: null,
      permissionKeys: [],
    } as ApiToken);

    await service.update(3, 1, { name: 'New', permissionKeys: ['resources.read'] });

    expect(persistence.updateToken).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: 'New' }), [
      'resources.read',
    ]);
  });

  it('paginates active tokens and their permission rows', async () => {
    persistence.activePage.mockResolvedValue([[], 12]);

    await expect(service.list(3, 2, 10)).resolves.toEqual({ data: [], total: 12, page: 2, limit: 10 });

    expect(persistence.activePage).toHaveBeenCalledWith(3, 2, 10);
  });

  it('refuses permissions no longer held by the owner', async () => {
    await expect(service.create(3, { name: 'Script', permissionKeys: ['resources.write'] })).rejects.toThrow(
      ForbiddenException,
    );
    expect(rbacService.getEffectivePermissions).toHaveBeenCalledWith(3, true);
  });

  it('rejects revoked and expired tokens before loading their owner', async () => {
    persistence.findByHash.mockResolvedValueOnce({
      permissionKeys: [],
      revokedAt: new Date(),
      expiresAt: null,
    } as unknown as import('@attraccess/application-models').ApiToken);
    await expect(service.authenticate('secret')).resolves.toBeNull();

    persistence.findByHash.mockResolvedValueOnce({
      permissionKeys: [],
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1),
    } as unknown as import('@attraccess/application-models').ApiToken);
    await expect(service.authenticate('secret')).resolves.toBeNull();
    expect(persistence.findOwner).not.toHaveBeenCalled();
  });

  it('rejects a token when its soft-deleted owner cannot be loaded', async () => {
    persistence.findByHash.mockResolvedValue({
      permissionKeys: [],
      id: 1,
      userId: 3,
      revokedAt: null,
      expiresAt: null,
    } as unknown as import('@attraccess/application-models').ApiToken);
    persistence.findOwner.mockResolvedValue(null);

    await expect(service.authenticate('secret')).resolves.toBeNull();
  });

  it('rejects a token when its owner is disabled', async () => {
    persistence.findByHash.mockResolvedValue({
      permissionKeys: [],
      id: 1,
      userId: 3,
      revokedAt: null,
      expiresAt: null,
    } as unknown as import('@attraccess/application-models').ApiToken);
    persistence.findOwner.mockResolvedValue({
      id: 3,
      isDisabled: true,
    } as unknown as import('@attraccess/application-models').User);

    await expect(service.authenticate('secret')).resolves.toBeNull();
  });

  it('only updates last used time while the token remains active', async () => {
    persistence.touchActive.mockResolvedValueOnce(true);
    persistence.findByHash.mockResolvedValue({
      permissionKeys: [],
      id: 1,
      userId: 3,
      revokedAt: null,
      expiresAt: null,
      lastUsedAt: null,
    } as unknown as import('@attraccess/application-models').ApiToken);
    persistence.findOwner.mockResolvedValue({ id: 3 } as unknown as import('@attraccess/application-models').User);

    await service.authenticate('secret');

    expect(persistence.touchActive).toHaveBeenCalledWith(1, expect.any(Date));
    expect(persistence.saveToken).not.toHaveBeenCalled();
  });

  it('rejects a token revoked or expired while updating its last used time', async () => {
    persistence.touchActive.mockResolvedValueOnce(false);
    persistence.findByHash.mockResolvedValue({
      permissionKeys: [],
      id: 1,
      userId: 3,
      revokedAt: null,
      expiresAt: null,
      lastUsedAt: null,
    } as unknown as import('@attraccess/application-models').ApiToken);
    persistence.findOwner.mockResolvedValue({ id: 3 } as unknown as import('@attraccess/application-models').User);

    await expect(service.authenticate('secret')).resolves.toBeNull();
  });
});
