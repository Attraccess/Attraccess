import { AuthenticationDetail, ResourceUsage, User } from '@attraccess/database-entities';
import { EntityManager } from 'typeorm';
import { ForbiddenException } from '@nestjs/common';
import { registerUsersServiceFixture } from './users.service.users-service.test-fixture';
export function registerConfirmSelfDeletionCases(fixture: ReturnType<typeof registerUsersServiceFixture>) {
  describe('confirmSelfDeletion', () => {
    const futureDate = new Date(Date.now() + 86_400_000);

    it('throws ForbiddenException when user is the last administrator', async () => {
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValue({
        id: 1,
        email: 'admin@example.com',
        deletedAt: null,
        deleteAccountToken: 'hashed:tok',
        deleteAccountTokenExpiresAt: futureDate,
      } as unknown as User);
      fixture.mockRbacService.isLastAdministrator.mockResolvedValue(true);

      await expect(fixture.service.confirmSelfDeletion('admin@example.com', 'tok')).rejects.toThrow(ForbiddenException);
    });

    it('treats a repeated confirmation as success after the email has been reused', async () => {
      const reusedEmailUser = {
        id: 2,
        deletedAt: null,
        deleteAccountToken: 'hashed:different-token',
        deleteAccountTokenExpiresAt: futureDate,
      } as User;
      const deletedUser = {
        id: 1,
        deletedAt: new Date(),
        deleteAccountToken: 'hashed:tok',
        deleteAccountTokenExpiresAt: futureDate,
      } as User;
      fixture.userRepository.findOne.mockResolvedValueOnce(reusedEmailUser).mockResolvedValueOnce(deletedUser);

      await expect(fixture.service.confirmSelfDeletion('deleted@example.com', 'tok')).resolves.toBeUndefined();

      expect(fixture.userRepository.findOne).toHaveBeenNthCalledWith(2, {
        where: expect.objectContaining({
          deleteAccountToken: expect.anything(),
          deletedAt: expect.anything(),
        }),
        withDeleted: true,
      });
    });

    it('rejects an expired confirmation token for a deleted account', async () => {
      const deletedUser = {
        id: 1,
        deletedAt: new Date(),
        deleteAccountToken: 'hashed:tok',
        deleteAccountTokenExpiresAt: new Date(Date.now() - 1_000),
      } as User;
      fixture.userRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(deletedUser);

      await expect(fixture.service.confirmSelfDeletion('deleted@example.com', 'tok')).rejects.toThrow(
        'DeleteAccountTokenExpiredException',
      );
    });

    it('retains confirmation token evidence while confirming an account deletion', async () => {
      const user = {
        id: 1,
        locale: 'en',
        deletedAt: null,
        deleteAccountToken: 'hashed:tok',
        deleteAccountTokenExpiresAt: futureDate,
        deleteAccountRequestedAt: new Date(),
      } as User;
      const userRepo = {
        findOne: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const usageRepo = { findOne: jest.fn().mockResolvedValue(null) };
      const authRepo = { delete: jest.fn().mockResolvedValue({ affected: 1 }) };
      const sessionRepo = { delete: jest.fn().mockResolvedValue({ affected: 1 }) };
      const manager = {
        getRepository: jest.fn((entity) => {
          if (entity === User) return userRepo;
          if (entity === ResourceUsage) return usageRepo;
          if (entity === AuthenticationDetail) return authRepo;
          return sessionRepo;
        }),
      } as unknown as EntityManager;
      fixture.dataSource.transaction.mockImplementation(async (callback) => callback(manager));

      fixture.userRepository.findOne.mockResolvedValue(user);

      await fixture.service.confirmSelfDeletion('deleted@example.com', 'tok');

      expect(userRepo.update).toHaveBeenCalledWith(
        1,
        expect.not.objectContaining({
          deleteAccountToken: expect.anything(),
          deleteAccountTokenExpiresAt: expect.anything(),
          deleteAccountRequestedAt: expect.anything(),
        }),
      );
    });
  });
}
