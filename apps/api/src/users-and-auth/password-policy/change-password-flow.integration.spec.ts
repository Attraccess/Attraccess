import { registerPasswordPolicyOnRemainingEndpointsIntegrationFixture } from './change-password-flow.integration.password-policy-on-remaining-endpoints-integration.test-fixture';
import { PasswordPolicyViolationException } from './password-policy.errors';
import { AuthenticationType } from '@attraccess/database-entities';
import * as bcrypt from 'bcrypt';

describe('Password policy on remaining endpoints (integration)', () => {
  const fixture = registerPasswordPolicyOnRemainingEndpointsIntegrationFixture();

  describe('POST /users/:id/password (setUserPassword)', () => {
    it('rejects a weak password with structured policy errors', async () => {
      const { passwordService, changePassword } = await fixture.buildController({ zxcvbnScore: 0 });
      await expect(
        passwordService.setUserPassword(42, { password: fixture.WEAK_PASSWORD }, { id: 42 } as never),
      ).rejects.toBeInstanceOf(PasswordPolicyViolationException);
      expect(changePassword).not.toHaveBeenCalled();
    });

    it('accepts a strong password and changes it', async () => {
      const { passwordService, changePassword } = await fixture.buildController({ zxcvbnScore: 4 });
      await passwordService.setUserPassword(42, { password: fixture.STRONG_PASSWORD }, { id: 42 } as never);
      expect(changePassword).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }), fixture.STRONG_PASSWORD);
    });

    it('blocks reuse when historySize > 0 and password matches current hash', async () => {
      const currentHash = await bcrypt.hash(fixture.STRONG_PASSWORD, 4);
      const { passwordService, changePassword } = await fixture.buildController({
        policy: { historySize: 3 },
        zxcvbnScore: 4,
        currentPasswordHash: currentHash,
      });
      await expect(
        passwordService.setUserPassword(42, { password: fixture.STRONG_PASSWORD }, { id: 42 } as never),
      ).rejects.toMatchObject({
        policyErrors: expect.arrayContaining([{ code: 'PASSWORD_REUSED', params: { historySize: 3 } }]),
      });
      expect(changePassword).not.toHaveBeenCalled();
    });

    it('archives current hash to history before changing when historySize > 0', async () => {
      const currentHash = await bcrypt.hash('Previous-Tr0ub4dor-9!Hum', 4);
      const { passwordService, historyRepo, changePassword } = await fixture.buildController({
        policy: { historySize: 2 },
        zxcvbnScore: 4,
        currentPasswordHash: currentHash,
      });
      await passwordService.setUserPassword(42, { password: fixture.STRONG_PASSWORD }, { id: 42 } as never);
      expect(historyRepo.save).toHaveBeenCalledWith(expect.objectContaining({ userId: 42, passwordHash: currentHash }));
      expect(changePassword).toHaveBeenCalled();
    });
  });

  describe('POST /users/:userId/change-password-by-token', () => {
    it('rejects a weak password and does not change it', async () => {
      const { passwordService, changePassword } = await fixture.buildController({ zxcvbnScore: 0 });
      await expect(
        passwordService.changePasswordViaResetToken(42, { password: fixture.WEAK_PASSWORD, token: 'reset-token-123' }),
      ).rejects.toBeInstanceOf(PasswordPolicyViolationException);
      expect(changePassword).not.toHaveBeenCalled();
    });

    it('accepts a strong password and clears the reset token', async () => {
      const { passwordService, changePassword, usersUpdateOne } = await fixture.buildController({ zxcvbnScore: 4 });
      await passwordService.changePasswordViaResetToken(42, {
        password: fixture.STRONG_PASSWORD,
        token: 'reset-token-123',
      });
      expect(changePassword).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }), fixture.STRONG_PASSWORD);
      expect(usersUpdateOne).toHaveBeenCalledWith(42, expect.objectContaining({ passwordResetToken: null }));
    });

    it('blocks reuse when candidate matches a prior history entry', async () => {
      const priorHash = await bcrypt.hash(fixture.ANOTHER_STRONG_PASSWORD, 4);
      const { passwordService, changePassword } = await fixture.buildController({
        policy: { historySize: 5 },
        zxcvbnScore: 4,
        currentPasswordHash: null,
        history: [{ id: 1, passwordHash: priorHash, userId: 42, createdAt: new Date() }],
      });
      await expect(
        passwordService.changePasswordViaResetToken(42, {
          password: fixture.ANOTHER_STRONG_PASSWORD,
          token: 'reset-token-123',
        }),
      ).rejects.toMatchObject({
        policyErrors: expect.arrayContaining([{ code: 'PASSWORD_REUSED', params: { historySize: 5 } }]),
      });
      expect(changePassword).not.toHaveBeenCalled();
    });
  });

  describe('POST /users/accept-invitation', () => {
    it('rejects a weak password and never adds auth details', async () => {
      const { registrationService, addAuthenticationDetails, verifyEmail } = await fixture.buildController({
        zxcvbnScore: 0,
      });
      await expect(
        registrationService.acceptInvitation({
          token: 'inv-token-123',
          email: 'jane@example.com',
          password: fixture.WEAK_PASSWORD,
        }),
      ).rejects.toBeInstanceOf(PasswordPolicyViolationException);
      expect(addAuthenticationDetails).not.toHaveBeenCalled();
      expect(verifyEmail).toHaveBeenCalled();
    });

    it('accepts a strong password and adds local auth details', async () => {
      const { registrationService, addAuthenticationDetails } = await fixture.buildController({ zxcvbnScore: 4 });
      const result = await registrationService.acceptInvitation({
        token: 'inv-token-123',
        email: 'jane@example.com',
        password: fixture.STRONG_PASSWORD,
      });
      expect(result).toEqual(expect.objectContaining({ id: 42, username: 'jane' }));
      expect(addAuthenticationDetails).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ type: AuthenticationType.LOCAL_PASSWORD }),
      );
    });
  });

  describe('logging hygiene', () => {
    it('never logs the raw password on weak rejection', async () => {
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      const { passwordService } = await fixture.buildController({ zxcvbnScore: 0 });
      await expect(
        passwordService.setUserPassword(42, { password: 'SuperSecretLeakable123!' }, { id: 42 } as never),
      ).rejects.toBeInstanceOf(PasswordPolicyViolationException);

      for (const spy of [debugSpy, logSpy, warnSpy, errorSpy]) {
        for (const call of spy.mock.calls) {
          for (const arg of call) {
            if (typeof arg === 'string') {
              expect(arg).not.toContain('SuperSecretLeakable123!');
            }
          }
        }
      }

      debugSpy.mockRestore();
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});
