import { User } from '@attraccess/database-entities';
import { UpdateResult } from 'typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { SSOUsernameChangeForbiddenException } from './errors/ssoUsernameChangeForbidden.exception';
import { registerUsersServiceFixture } from './users.service.users-service.test-fixture';
export function registerChangeUsernameCases(fixture: ReturnType<typeof registerUsersServiceFixture>) {
  describe('changeUsername', () => {
    beforeEach(() => {
      jest.spyOn(fixture.service, 'isSSOUser').mockResolvedValue(false);
    });

    const baseUser = (overrides: Partial<User> = {}): User =>
      ({
        id: 1,
        username: 'olduser',
        email: 'user@example.com',

        createdAt: new Date(),
        updatedAt: new Date(),
        isEmailVerified: false,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
        lastUsernameChangeAt: null,
        resourceIntroductions: [],
        resourceUsages: [],
        resourceIntroducers: [],
        groupMemberships: [],
        nfcCards: [],
        authenticationDetails: [],
        resourceIntroducerPermissions: [],
        externalIdentifier: null,
        nfcKeySeedToken: null,
        ownedProjects: [],
        sessions: [],
        ...overrides,
      }) as User;

    it('should throw if target user not found', async () => {
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(null);

      await expect(fixture.service.changeUsername(123, 'newuser', baseUser())).rejects.toThrow(UserNotFoundException);
    });

    it("should forbid changing another user's username without permission", async () => {
      const target = baseUser({ id: 2 });
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(target);

      await expect(fixture.service.changeUsername(2, 'newuser', baseUser({ id: 1 }))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should enforce once-per-day limit for self-change when not admin', async () => {
      const recent = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const me = baseUser({ id: 10, lastUsernameChangeAt: recent });
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(me);

      await expect(fixture.service.changeUsername(10, 'newuser', me)).rejects.toThrow(BadRequestException);
    });

    it('should allow self-change and update lastUsernameChangeAt and send email', async () => {
      const me = baseUser({ id: 10, username: 'me' });
      const updated = { ...me, username: 'newuser', lastUsernameChangeAt: new Date() } as User;
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(me).mockResolvedValueOnce(updated);
      const updateSpy = jest.spyOn(fixture.userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);

      const result = await fixture.service.changeUsername(10, 'newuser', me);

      expect(updateSpy).toHaveBeenCalledWith(
        10,
        expect.objectContaining({
          username: 'newuser',
          lastUsernameChangeAt: expect.any(Date),
        }),
      );
      expect(fixture.emailService.sendUsernameChangedEmail).toHaveBeenCalledWith(updated, 'me');
      expect(result).toBe(updated);
    });

    it("should allow admin to change another user's username without altering lastUsernameChangeAt", async () => {
      const target = baseUser({ id: 20, username: 'target', lastUsernameChangeAt: null });
      const admin = baseUser({
        id: 1,
        effectivePermissions: new Set(['users.update']),
      } as never);
      const updated = { ...target, username: 'new_admin_set', lastUsernameChangeAt: null } as User;
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(target).mockResolvedValueOnce(updated);
      const updateSpy = jest.spyOn(fixture.userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);

      const result = await fixture.service.changeUsername(20, 'new_admin_set', admin);

      expect(updateSpy).toHaveBeenCalledWith(
        20,
        expect.objectContaining({
          username: 'new_admin_set',
        }),
      );
      expect(fixture.emailService.sendUsernameChangedEmail).toHaveBeenCalledWith(updated, 'target');
      expect(result).toBe(updated);
    });

    it('should validate new username format', async () => {
      const me = baseUser({ id: 10 });
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(me);

      await expect(fixture.service.changeUsername(10, 'x', me)).rejects.toThrow(BadRequestException);
    });

    it('should forbid changing username for SSO users', async () => {
      const me = baseUser({ id: 5 });
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(me);
      jest.spyOn(fixture.service, 'isSSOUser').mockResolvedValueOnce(true);

      await expect(fixture.service.changeUsername(5, 'newuser', me)).rejects.toThrow(
        SSOUsernameChangeForbiddenException,
      );
    });
  });
}
