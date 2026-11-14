import { registerUsersServiceFixture } from './users.service.users-service.test-fixture';
import { User } from '@attraccess/database-entities';
import { EntityManager, QueryFailedError } from 'typeorm';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('UsersService', () => {
  const fixture = registerUsersServiceFixture();

  describe('email changes', () => {
    const actor = Object.assign(new User(), { id: 1, email: 'old@example.com' });
    beforeEach(() => {
      jest.spyOn(fixture.accounts, 'findOne').mockResolvedValueOnce(actor).mockResolvedValue(null);
    });
    it('changes and reverifies an email inside the transaction', async () => {
      const updated = Object.assign(new User(), { id: 1, email: 'new@example.com' });
      jest
        .mocked(fixture.accounts.findOne)
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
      expect(await fixture.service.changeEmail(1, ' New@Example.COM ', actor)).toBe(updated);
      expect(fixture.userRepository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          email: 'new@example.com',
          isEmailVerified: false,
          emailVerificationToken: expect.any(String),
          emailVerificationTokenExpiresAt: expect.any(Date),
        }),
      );
      expect(fixture.accounts.findOne).toHaveBeenLastCalledWith({ id: 1 }, undefined, manager);
      expect(fixture.emailService.sendVerificationEmail).toHaveBeenCalledWith(updated, expect.any(String));
    });
    it('treats a case-only change of the own email as unchanged', async () => {
      expect(await fixture.service.changeEmail(1, ' OLD@Example.com ', actor)).toBe(actor);
      expect(fixture.dataSource.transaction).not.toHaveBeenCalled();
      expect(fixture.emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });
    it("rejects a case-variant of another user's email", async () => {
      jest
        .mocked(fixture.accounts.findOne)
        .mockReset()
        .mockResolvedValueOnce(actor)
        .mockResolvedValueOnce(Object.assign(new User(), { id: 2, email: 'taken@example.com' }));
      await expect(fixture.service.changeEmail(1, ' TAKEN@Example.com ', actor)).rejects.toThrow(
        new BadRequestException('Email already exists'),
      );
      expect(fixture.accounts.findOne).toHaveBeenLastCalledWith({ email: 'taken@example.com' });
      expect(fixture.dataSource.transaction).not.toHaveBeenCalled();
    });
    it('leaves an unchanged email verified without a transaction', async () => {
      expect(await fixture.service.changeEmail(1, ' old@example.com ', actor)).toBe(actor);
      expect(fixture.dataSource.transaction).not.toHaveBeenCalled();
    });
    it.each(['', 'invalid'])('rejects invalid email %p before reading users', async (email) => {
      await expect(fixture.service.changeEmail(1, email, actor)).rejects.toThrow(BadRequestException);
      expect(fixture.accounts.findOne).not.toHaveBeenCalled();
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
});
