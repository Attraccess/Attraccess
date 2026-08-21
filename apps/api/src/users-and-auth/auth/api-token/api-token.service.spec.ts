import { ForbiddenException } from '@nestjs/common';
import { ApiToken } from '@attraccess/database-entities';
import { ApiTokenService } from './api-token.service';

describe('ApiTokenService', () => {
  const repository = {
    create: jest.fn((value) => value),
    save: jest.fn(),
    find: jest.fn(),
    findOneBy: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const userRepository = { findOneBy: jest.fn() };
  const tokenHashService = { hashApiToken: jest.fn((token) => `hashed:${token}`) };
  const service = new ApiTokenService(repository as never, userRepository as never, tokenHashService as never);

  beforeEach(() => jest.clearAllMocks());

  it('stores only the hash and returns the secret once on creation', async () => {
    repository.save.mockImplementation(async (value) => ({ ...value, id: 1, createdAt: new Date() }));

    const result = await service.create(3, new Set(['resources.read']), {
      name: 'Script',
      permissionKeys: ['resources.read'],
    });

    expect(result.token).toHaveLength(43);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: `hashed:${result.token}`, permissionKeys: ['resources.read'] }),
    );
    expect(result.apiToken).not.toHaveProperty('token');
  });

  it('refuses permissions outside the authenticating principal permissions', async () => {
    await expect(
      service.create(3, new Set(['resources.read']), { name: 'Script', permissionKeys: ['resources.write'] }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects revoked and expired tokens before loading their owner', async () => {
    repository.findOneBy.mockResolvedValueOnce({ revokedAt: new Date(), expiresAt: null });
    await expect(service.authenticate('secret')).resolves.toBeNull();

    repository.findOneBy.mockResolvedValueOnce({ revokedAt: null, expiresAt: new Date(Date.now() - 1) });
    await expect(service.authenticate('secret')).resolves.toBeNull();
    expect(userRepository.findOneBy).not.toHaveBeenCalled();
  });

  it('rejects a token when its soft-deleted owner cannot be loaded', async () => {
    repository.findOneBy.mockResolvedValue({ id: 1, userId: 3, revokedAt: null, expiresAt: null });
    userRepository.findOneBy.mockResolvedValue(null);

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
    repository.findOneBy.mockResolvedValue({ id: 1, userId: 3, revokedAt: null, expiresAt: null, lastUsedAt: null });
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
    repository.findOneBy.mockResolvedValue({ id: 1, userId: 3, revokedAt: null, expiresAt: null, lastUsedAt: null });
    userRepository.findOneBy.mockResolvedValue({ id: 3 });

    await expect(service.authenticate('secret')).resolves.toBeNull();
  });
});
