import { registerUsersServiceFixture } from './users.service.users-service.test-fixture';
import { registerPersistenceErrorClassifier } from '../../database/persistence-errors';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

// The driver specific codes are covered where the adapter maps them; here a neutral category is enough.
registerPersistenceErrorClassifier({
  classify: (error) => ((error as { code?: string })?.code === 'UNIQUE' ? 'unique-violation' : undefined),
  diagnosticCode: () => undefined,
});

describe('UsersService', () => {
  const fixture = registerUsersServiceFixture();

  describe('email changes', () => {
    const seedOwner = (overrides = {}) =>
      fixture.store.seed({
        id: 1,
        username: 'owner',
        email: 'old@example.com',
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
        ...overrides,
      })[0];

    it('changes and reverifies an email in a unit of work, then sends the verification email after the commit', async () => {
      const owner = seedOwner();
      fixture.emailService.sendVerificationEmail.mockImplementation(async () => {
        fixture.uow.events.push('send');
      });

      const updated = await fixture.service.changeEmail(owner.id, ' New@Example.COM ', owner);

      expect(updated).toMatchObject({
        id: 1,
        email: 'new@example.com',
        isEmailVerified: false,
        emailVerificationToken: expect.any(String),
        emailVerificationTokenExpiresAt: expect.any(Date),
      });
      expect(fixture.emailService.sendVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com' }),
        updated.emailVerificationToken,
      );
      expect(fixture.uow.events).toEqual(['begin', 'commit', 'send']);
    });

    it('never sends the mail when the change rolls back', async () => {
      const owner = seedOwner();
      fixture.store.failNextUpdateWith = new Error('database unavailable');

      await expect(fixture.service.changeEmail(owner.id, 'new@example.com', owner)).rejects.toThrow(
        'database unavailable',
      );

      expect(fixture.uow.events).toEqual(['begin', 'rollback']);
      expect(fixture.emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('takes the email change back when the verification email cannot be sent', async () => {
      const owner = seedOwner();
      const smtpDown = new Error('SMTP down');
      fixture.emailService.sendVerificationEmail.mockRejectedValueOnce(smtpDown);

      await expect(fixture.service.changeEmail(owner.id, 'new@example.com', owner)).rejects.toBe(smtpDown);

      expect(fixture.store.users[0]).toMatchObject({
        email: 'old@example.com',
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
      });
    });

    it('does not undo a newer change when taking the failed one back', async () => {
      const owner = seedOwner();
      fixture.emailService.sendVerificationEmail.mockImplementationOnce(async () => {
        // a second change replaced the pending verification while the mail was being sent
        Object.assign(fixture.store.users[0], { email: 'newer@example.com', emailVerificationToken: 'newer-token' });
        throw new Error('SMTP down');
      });

      await expect(fixture.service.changeEmail(owner.id, 'new@example.com', owner)).rejects.toThrow('SMTP down');

      expect(fixture.store.users[0]).toMatchObject({
        email: 'newer@example.com',
        emailVerificationToken: 'newer-token',
      });
    });

    it('still reports the mail failure when taking the change back fails too', async () => {
      const owner = seedOwner();
      const smtpDown = new Error('SMTP down');
      fixture.emailService.sendVerificationEmail.mockRejectedValueOnce(smtpDown);
      jest.spyOn(fixture.store, 'revertEmailChange').mockRejectedValueOnce(new Error('database gone'));

      await expect(fixture.service.changeEmail(owner.id, 'new@example.com', owner)).rejects.toBe(smtpDown);
    });

    it('treats a case-only change of the own email as unchanged', async () => {
      const owner = seedOwner();
      expect(await fixture.service.changeEmail(1, ' OLD@Example.com ', owner)).toMatchObject({ id: 1 });
      expect(fixture.uow.events).toEqual([]);
      expect(fixture.emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it("rejects a case-variant of another user's email", async () => {
      const owner = seedOwner();
      fixture.store.seed({ id: 2, username: 'other', email: 'taken@example.com' });

      await expect(fixture.service.changeEmail(1, ' TAKEN@Example.com ', owner)).rejects.toThrow(
        new BadRequestException('Email already exists'),
      );
      expect(fixture.uow.events).toEqual([]);
    });

    it.each(['', 'invalid'])('rejects invalid email %p before reading users', async (email) => {
      const spy = jest.spyOn(fixture.store, 'findUser');
      await expect(fixture.service.changeEmail(1, email, { id: 1 })).rejects.toThrow(BadRequestException);
      expect(spy).not.toHaveBeenCalled();
    });

    it('rejects editing another user without permission', async () => {
      const owner = seedOwner();
      fixture.store.seed({ id: 2, username: 'other', email: 'other@example.com' });

      await expect(fixture.service.changeEmail(2, 'new@example.com', owner)).rejects.toThrow(ForbiddenException);
      expect(fixture.uow.events).toEqual([]);
    });

    it('lets an administrator change another users email', async () => {
      fixture.store.seed({ id: 2, username: 'other', email: 'other@example.com' });
      const admin = { id: 1, effectivePermissions: new Set(['users.update']) };

      await expect(fixture.service.changeEmail(2, 'changed@example.com', admin)).resolves.toMatchObject({
        id: 2,
        email: 'changed@example.com',
      });
    });

    it('translates a concurrent unique constraint failure', async () => {
      const owner = seedOwner();
      fixture.store.failNextUpdateWith = Object.assign(new Error('duplicate'), { code: 'UNIQUE' });

      await expect(fixture.service.changeEmail(1, 'new@example.com', owner)).rejects.toThrow('Email already exists');
      expect(fixture.emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('preserves unrelated failures', async () => {
      const owner = seedOwner();
      fixture.store.failNextUpdateWith = new Error('database unavailable');

      await expect(fixture.service.changeEmail(1, 'new@example.com', owner)).rejects.toThrow('database unavailable');
    });
  });
});
