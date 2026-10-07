import { User } from '@attraccess/database-entities';
import { EntityManager, QueryFailedError, UpdateResult } from 'typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { registerUsersServiceFixture } from './users.service.users-service.test-fixture';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';

export function registerEmailChangesCases(fixture: ReturnType<typeof registerUsersServiceFixture>) {
  describe('email changes', () => {
    const actor = Object.assign(new User(), { id: 1, email: 'old@example.com' });
    beforeEach(() => {
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(actor).mockResolvedValue(null);
    });
    it('changes and reverifies an email inside the transaction', async () => {
      const updated = Object.assign(new User(), { id: 1, email: 'new@example.com' });
      jest
        .mocked(fixture.service.findOne)
        .mockReset()
        .mockResolvedValueOnce(actor)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(updated);
      const manager = new EntityManager(fixture.dataSource);
      jest.spyOn(manager, 'getRepository').mockReturnValue(fixture.userRepository);
      fixture.dataSource.transaction.mockImplementation(async (workOrIsolation, work) => {
        const callback = typeof workOrIsolation === 'function' ? workOrIsolation : work;
        if (!callback) throw new Error('Missing transaction callback');
        return callback(manager);
      });
      expect(await fixture.service.changeEmail(1, ' new@example.com ', actor)).toBe(updated);
      expect(fixture.userRepository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          email: 'new@example.com',
          isEmailVerified: false,
          emailVerificationToken: expect.any(String),
          emailVerificationTokenExpiresAt: expect.any(Date),
        }),
      );
      expect(fixture.service.findOne).toHaveBeenLastCalledWith({ id: 1 }, undefined, manager);
      expect(fixture.emailService.sendVerificationEmail).toHaveBeenCalledWith(updated, expect.any(String));
    });
    it('leaves an unchanged email verified without a transaction', async () => {
      expect(await fixture.service.changeEmail(1, ' old@example.com ', actor)).toBe(actor);
      expect(fixture.dataSource.transaction).not.toHaveBeenCalled();
    });
    it.each(['', 'invalid'])('rejects invalid email %p before reading users', async (email) => {
      await expect(fixture.service.changeEmail(1, email, actor)).rejects.toThrow(BadRequestException);
      expect(fixture.service.findOne).not.toHaveBeenCalled();
    });
    it('rejects editing another user without permission', async () => {
      await expect(fixture.service.changeEmail(2, 'new@example.com', actor)).rejects.toThrow(ForbiddenException);
      expect(fixture.dataSource.transaction).not.toHaveBeenCalled();
    });
    it.each(['23505', 'SQLITE_CONSTRAINT', 'SQLITE_CONSTRAINT_UNIQUE', 'ER_DUP_ENTRY', 1062])(
      'translates a concurrent unique constraint failure (%p)',
      async (code) => {
        fixture.dataSource.transaction.mockRejectedValue(
          new QueryFailedError('UPDATE users', [], Object.assign(new Error('duplicate'), { code })),
        );
        await expect(fixture.service.changeEmail(1, 'new@example.com', actor)).rejects.toThrow('Email already exists');
      },
    );
    it.each([
      [
        new QueryFailedError('UPDATE users', [], new Error('UNIQUE constraint failed: user.email')),
        'Email already exists',
      ],
      [new QueryFailedError('UPDATE users', [], new Error('database unavailable')), 'database unavailable'],
      [new Error('mail delivery failed'), 'mail delivery failed'],
    ])('preserves unrelated failures and recognizes email uniqueness by message', async (error, message) => {
      fixture.dataSource.transaction.mockRejectedValue(error);
      await expect(fixture.service.changeEmail(1, 'new@example.com', actor)).rejects.toThrow(message);
    });
  });
}

export function registerFindOneCases(fixture: ReturnType<typeof registerUsersServiceFixture>) {
  describe('findOne', () => {
    it('should validate options using Zod', async () => {
      await expect(fixture.service.findOne({})).rejects.toThrow('At least one search criteria must be provided');
    });

    it('should find a user by id', async () => {
      const user = { id: 1, username: 'test' } as User;
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValue(user);

      const result = await fixture.service.findOne({ id: 1 });
      expect(result).toEqual(user);
    });

    it('should find a user by username', async () => {
      const user = { id: 1, username: 'test' } as User;
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValue(user);

      const result = await fixture.service.findOne({ username: 'test' });
      expect(result).toEqual(user);
    });

    it('should find a user by email', async () => {
      const user = { id: 1, email: 'test@example.com' } as User;
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValue(user);

      const result = await fixture.service.findOne({ email: 'test@example.com' });
      expect(result).toEqual(user);
    });

    it('should validate email format', async () => {
      await expect(fixture.service.findOne({ email: 'invalid-email' })).rejects.toThrow();
    });
  });
}

export function registerRollbackFailedRegistrationCases(fixture: ReturnType<typeof registerUsersServiceFixture>) {
  describe('rollbackFailedRegistration', () => {
    it('hard-deletes the unregistered user without updating user metrics', async () => {
      const manager = { delete: jest.fn().mockResolvedValue(undefined) };
      fixture.dataSource.transaction.mockImplementation(async (callback) => callback(manager as EntityManager));

      await fixture.service.rollbackFailedRegistration(14);

      expect(fixture.dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.delete).toHaveBeenCalledWith(User, 14);
      expect(fixture.mockMetricsService.usersTotal.dec).not.toHaveBeenCalled();
      expect(fixture.mockMetricsService.usersPerLocale.dec).not.toHaveBeenCalled();
    });
  });
}

export function registerShouldBeDefinedCases(fixture: ReturnType<typeof registerUsersServiceFixture>) {
  it('should be defined', () => {
    expect(fixture.service).toBeDefined();
  });
}

export function registerUpdateLocaleCases(fixture: ReturnType<typeof registerUsersServiceFixture>) {
  describe('updateLocale', () => {
    it('saves cleaned locale, updates gauge, and returns user', async () => {
      const existing = { id: 1, locale: 'en' } as User;
      const updated = { id: 1, locale: 'de' } as User;
      jest.spyOn(fixture.userRepository, 'update').mockResolvedValue({} as UpdateResult);
      jest.spyOn(fixture.service, 'findOne').mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);

      const result = await fixture.service.updateLocale(1, 'de-DE');
      expect(fixture.userRepository.update).toHaveBeenCalledWith(1, { locale: 'de-DE' });
      expect(fixture.mockMetricsService.usersLocaleSyncsTotal.inc).toHaveBeenCalledWith({ locale: 'de-DE' });
      expect(fixture.mockMetricsService.usersPerLocale.dec).toHaveBeenCalledWith({ locale: 'en' });
      expect(fixture.mockMetricsService.usersPerLocale.inc).toHaveBeenCalledWith({ locale: 'de-DE' });
      expect(result).toEqual(updated);
    });

    it('throws BadRequestException for empty locale', async () => {
      await expect(fixture.service.updateLocale(1, '   ')).rejects.toThrow(BadRequestException);
    });
  });
}

export function registerUpdateUserCases(fixture: ReturnType<typeof registerUsersServiceFixture>) {
  describe('updateUser', () => {
    it('should update allowed fields and trim values', async () => {
      const updatedUser = {
        id: 1,
        externalIdentifier: 'ext-updated',
      } as User;
      jest.spyOn(fixture.userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValue(updatedUser);

      const result = await fixture.service.updateOne(1, { externalIdentifier: '  ext-updated  ' });

      expect(fixture.userRepository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ externalIdentifier: 'ext-updated' }),
      );
      expect(result).toEqual(updatedUser);
    });

    it('should update verification tokens', async () => {
      const updatedUser = {
        id: 1,
        emailVerificationToken: 'token',
        emailVerificationTokenExpiresAt: new Date(),
      } as User;
      jest.spyOn(fixture.userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValue(updatedUser);

      const tokenExpiry = new Date();
      const result = await fixture.service.updateOne(1, {
        emailVerificationToken: '  token  ',
        emailVerificationTokenExpiresAt: tokenExpiry,
      });

      expect(fixture.userRepository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          emailVerificationToken: 'token',
          emailVerificationTokenExpiresAt: tokenExpiry,
        }),
      );
      expect(result).toEqual(updatedUser);
    });

    it('should throw if user not found after update', async () => {
      jest.spyOn(fixture.userRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);
      jest.spyOn(fixture.userRepository, 'findOne').mockResolvedValue(null);

      await expect(fixture.service.updateOne(1, { externalIdentifier: 'value' })).rejects.toThrow(
        UserNotFoundException,
      );
    });
  });
}
