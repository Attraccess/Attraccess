import { ForbiddenException } from '@nestjs/common';
import { ApiToken } from '@attraccess/database-entities';
import { ApiTokenService } from './api-token.service';

describe('ApiTokenService', () => {
  const repository = {
    create: jest.fn((value) => value),
    save: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    createQueryBuilder: jest.fn(),
    manager: {
      getRepository: jest.fn(),
      transaction: jest.fn(),
    },
  };
  const userRepository = { findOneBy: jest.fn() };
  const apiTokenPermissionRepository = { create: jest.fn((value) => value), save: jest.fn(), delete: jest.fn() };
  const tokenHashService = { hashApiToken: jest.fn((token) => `hashed:${token}`) };
  const rbacService = { getEffectivePermissions: jest.fn() };
  const service = new ApiTokenService(
    repository as never,
    userRepository as never,
    tokenHashService as never,
    rbacService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    rbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.read']));
    repository.manager.getRepository.mockImplementation((entity) =>
      entity === ApiToken ? repository : apiTokenPermissionRepository,
    );
    repository.manager.transaction.mockImplementation((callback) => callback(repository.manager));
  });

  it('stores only the hash and returns the secret once on creation', async () => {
    repository.save.mockImplementation(async (value) => ({ ...value, id: 1, createdAt: new Date() }));
    apiTokenPermissionRepository.save.mockImplementation(async (value) => value);

    const result = await service.create(3, {
      name: 'Script',
      permissionKeys: ['resources.read'],
    });

    expect(result.token).toHaveLength(43);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: `hashed:${result.token}` }),
    );
    expect(result.apiToken).not.toHaveProperty('token');
  });

  it('creates the token and its permissions through one transaction', async () => {
    repository.save.mockImplementation(async (value) => ({ ...value, id: 1, createdAt: new Date() }));
    apiTokenPermissionRepository.save.mockResolvedValue([]);

    await service.create(3, { name: 'Script', permissionKeys: ['resources.read'] });

    expect(repository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(apiTokenPermissionRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ apiTokenId: 1, permissionKey: 'resources.read' }),
    ]);
  });

  it('replaces permissions and token metadata through one transaction', async () => {
    repository.findOne.mockResolvedValue({ id: 1, userId: 3, name: 'Old', revokedAt: null, apiTokenPermissions: [] });
    repository.save.mockImplementation(async (value) => value);
    apiTokenPermissionRepository.save.mockResolvedValue([]);

    await service.update(3, 1, { name: 'New', permissionKeys: ['resources.read'] });

    expect(repository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(apiTokenPermissionRepository.delete).toHaveBeenCalledWith({ apiTokenId: 1 });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'New' }));
  });

  it('paginates active tokens and their permission rows', async () => {
    repository.findAndCount.mockResolvedValue([[], 12]);

    await expect(service.list(3, 2, 10)).resolves.toEqual({ data: [], total: 12, page: 2, limit: 10 });

    expect(repository.findAndCount).toHaveBeenCalledWith({
      where: { userId: 3, revokedAt: null },
      order: { createdAt: 'DESC', id: 'DESC' },
      relations: { apiTokenPermissions: true },
      skip: 10,
      take: 10,
    });
  });

  it('refuses permissions no longer held by the owner', async () => {
    await expect(
      service.create(3, { name: 'Script', permissionKeys: ['resources.write'] }),
    ).rejects.toThrow(ForbiddenException);
    expect(rbacService.getEffectivePermissions).toHaveBeenCalledWith(3, true);
  });

  it('rejects revoked and expired tokens before loading their owner', async () => {
    repository.findOne.mockResolvedValueOnce({ revokedAt: new Date(), expiresAt: null });
    await expect(service.authenticate('secret')).resolves.toBeNull();

    repository.findOne.mockResolvedValueOnce({ revokedAt: null, expiresAt: new Date(Date.now() - 1) });
    await expect(service.authenticate('secret')).resolves.toBeNull();
    expect(userRepository.findOneBy).not.toHaveBeenCalled();
  });

  it('rejects a token when its soft-deleted owner cannot be loaded', async () => {
    repository.findOne.mockResolvedValue({ id: 1, userId: 3, revokedAt: null, expiresAt: null });
    userRepository.findOneBy.mockResolvedValue(null);

    await expect(service.authenticate('secret')).resolves.toBeNull();
  });

  it('rejects a token when its owner is disabled', async () => {
    repository.findOne.mockResolvedValue({ id: 1, userId: 3, revokedAt: null, expiresAt: null });
    userRepository.findOneBy.mockResolvedValue({ id: 3, isDisabled: true });

    await expect(service.authenticate('secret')).resolves.toBeNull();
  });

  it('only updates last used time while the token remains active', async () => {
    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    repository.createQueryBuilder.mockReturnValue(queryBuilder);
    repository.findOne.mockResolvedValue({ id: 1, userId: 3, revokedAt: null, expiresAt: null, lastUsedAt: null });
    userRepository.findOneBy.mockResolvedValue({ id: 3 });

    await service.authenticate('secret');

    expect(queryBuilder.update).toHaveBeenCalledWith(ApiToken);
    expect(queryBuilder.where).toHaveBeenCalledWith('id = :id', { id: 1 });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('revokedAt IS NULL');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('(expiresAt IS NULL OR expiresAt > :now)', {
      now: expect.any(Date),
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects a token revoked or expired while updating its last used time', async () => {
    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    repository.createQueryBuilder.mockReturnValue(queryBuilder);
    repository.findOne.mockResolvedValue({ id: 1, userId: 3, revokedAt: null, expiresAt: null, lastUsedAt: null });
    userRepository.findOneBy.mockResolvedValue({ id: 3 });

    await expect(service.authenticate('secret')).resolves.toBeNull();
  });
});
