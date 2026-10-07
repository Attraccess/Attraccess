import { registerPasswordPolicyServiceFixture } from './password-policy.service.password-policy-service.test-fixture';
import { PasswordPolicyRole, AuthenticationType } from '@attraccess/database-entities';
import * as bcrypt from 'bcrypt';
import { DEFAULT_PASSWORD_POLICY } from '@attraccess/shared';

export function registerAcceptsAStrongPasswordHibpCleanScoreAboveThresholdCases(
  fixture: ReturnType<typeof registerPasswordPolicyServiceFixture>,
) {
  it('accepts a strong password (HIBP clean, score above threshold)', async () => {
    const result = await fixture.service.validate('Tr0ub4dor-Hummingbird-9!plate', {
      username: 'someone-else',
      email: 'else@example.com',
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
}

export function registerAuditsACommittedGlobalPolicyChangeWithBeforeAfterValuesAndActorAttributioCases(
  fixture: ReturnType<typeof registerPasswordPolicyServiceFixture>,
) {
  it('audits a committed global policy change with before/after values and actor attribution', async () => {
    await fixture.service.updatePolicy({ minLength: 14 }, fixture.audit);
    expect(fixture.identityAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'password_policy_updated',
        actorId: 7,
        apiTokenId: 9,
        authenticationMethod: 'api-token',
        subjectId: 1,
        outcome: 'succeeded',
        request: { ipAddress: '192.0.2.7', userAgent: 'fixture' },
        details: { field: 'minLength', before: expect.any(String), after: expect.any(String) },
      }),
    );
    const details = fixture.identityAudit.record.mock.calls[0][0].details;
    expect(JSON.parse(details.before).minLength).toBe(12);
    expect(JSON.parse(details.after).minLength).toBe(14);
  });
}

export function registerAuditsRoleOverrideCreationAndDeletionWhileRetainingTheDeletedPolicySnapshoCases(
  fixture: ReturnType<typeof registerPasswordPolicyServiceFixture>,
) {
  it('audits role override creation and deletion while retaining the deleted policy snapshot', async () => {
    await fixture.service.upsertOverride(
      PasswordPolicyRole.ADMIN,
      { minLength: 16, requireDigit: true },
      fixture.audit,
    );
    expect(fixture.identityAudit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'password_policy_override_updated',
        details: { role: PasswordPolicyRole.ADMIN, after: expect.any(String) },
      }),
    );
    fixture.overrideRepo.findOne.mockResolvedValue(fixture.buildOverride({ minLength: 16, requireDigit: true }));
    await fixture.service.deleteOverride(PasswordPolicyRole.ADMIN, fixture.audit);
    expect(fixture.identityAudit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'password_policy_override_deleted',
        details: { role: PasswordPolicyRole.ADMIN, before: expect.any(String) },
      }),
    );
    expect(JSON.parse(fixture.identityAudit.record.mock.calls[1][0].details.before)).toMatchObject({
      minLength: 16,
      requireDigit: true,
    });
  });
}

export function registerDoesNotEmitSuccessfulAuditRecordsWhenPolicyPersistenceFailsCases(
  fixture: ReturnType<typeof registerPasswordPolicyServiceFixture>,
) {
  it('does not emit successful audit records when policy persistence fails', async () => {
    fixture.repo.save.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(fixture.service.updatePolicy({ minLength: 14 }, fixture.audit)).rejects.toThrow(
      'Database unavailable',
    );
    expect(fixture.identityAudit.record).not.toHaveBeenCalled();
  });
}

export function registerPasswordHistoryCases(fixture: ReturnType<typeof registerPasswordPolicyServiceFixture>) {
  describe('password history', () => {
    const currentPassword = 'Old-Tr0ub4dor-Hummingbird-9!plate';
    const reusedPriorPassword = 'Older-Tr0ub4dor-Hummingbird-9!plate';

    it('flags PASSWORD_REUSED when candidate matches current password hash', async () => {
      const currentHash = await bcrypt.hash(currentPassword, 4);
      fixture.repo.findOne = jest.fn(async () => fixture.buildRow({ historySize: 3 }));
      fixture.authDetailRepo.findOne = jest.fn(async () => ({
        password: currentHash,
        type: AuthenticationType.LOCAL_PASSWORD,
      }));

      const result = await fixture.service.validate(
        currentPassword,
        { username: 'else', email: 'else@example.com' },
        { userIdForHistory: 7 },
      );
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual({ code: 'PASSWORD_REUSED', params: { historySize: 3 } });
    });

    it('flags PASSWORD_REUSED when candidate matches a prior history entry', async () => {
      const currentHash = await bcrypt.hash(currentPassword, 4);
      const priorHash = await bcrypt.hash(reusedPriorPassword, 4);
      fixture.repo.findOne = jest.fn(async () => fixture.buildRow({ historySize: 3 }));
      fixture.authDetailRepo.findOne = jest.fn(async () => ({ password: currentHash }));
      fixture.historyRepo.find = jest.fn(async () => [
        { id: 1, passwordHash: priorHash, userId: 7, createdAt: new Date() },
      ]);

      const result = await fixture.service.validate(
        reusedPriorPassword,
        { username: 'else', email: 'else@example.com' },
        { userIdForHistory: 7 },
      );
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual({ code: 'PASSWORD_REUSED', params: { historySize: 3 } });
    });

    it('does not check history when historySize is 0', async () => {
      fixture.repo.findOne = jest.fn(async () => fixture.buildRow({ historySize: 0 }));
      await fixture.service.validate('Tr0ub4dor-Hummingbird-9!plate', {}, { userIdForHistory: 7 });
      expect(fixture.authDetailRepo.findOne).not.toHaveBeenCalled();
      expect(fixture.historyRepo.find).not.toHaveBeenCalled();
    });

    it('archiveCurrentPasswordToHistory saves the current hash and prunes', async () => {
      const currentHash = await bcrypt.hash(currentPassword, 4);
      fixture.repo.findOne = jest.fn(async () => fixture.buildRow({ historySize: 2 }));
      fixture.authDetailRepo.findOne = jest.fn(async () => ({ password: currentHash }));

      await fixture.service.archiveCurrentPasswordToHistory(11);
      expect(fixture.historyRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 11, passwordHash: currentHash }),
      );
      expect(fixture.historyRepo.createQueryBuilder).toHaveBeenCalled();
    });

    it('archiveCurrentPasswordToHistory is a no-op when historySize is 0', async () => {
      fixture.repo.findOne = jest.fn(async () => fixture.buildRow({ historySize: 0 }));
      await fixture.service.archiveCurrentPasswordToHistory(11);
      expect(fixture.historyRepo.save).not.toHaveBeenCalled();
    });
  });
}

export function registerRejectsAWeakPasswordWithStructuredPolicyErrorsCases(
  fixture: ReturnType<typeof registerPasswordPolicyServiceFixture>,
) {
  it('rejects a weak password with structured policy errors', async () => {
    fixture.zxcvbn.evaluate = jest.fn(() => ({
      score: 0,
      guessesLog10: 1,
      crackTimesSeconds: {},
      warning: '',
      suggestions: [],
    }));
    const result = await fixture.service.validate('password', { username: 'alice', email: 'alice@example.com' });
    expect(result.ok).toBe(false);
    const codes = result.errors.map((e) => e.code);
    expect(codes).toEqual(expect.arrayContaining(['MIN_LENGTH', 'COMMON_PASSWORD', 'ZXCVBN_SCORE']));
  });
}

export function registerReportsHibpPwnedWithCountCases(
  fixture: ReturnType<typeof registerPasswordPolicyServiceFixture>,
) {
  it('reports HIBP pwned with count', async () => {
    fixture.hibp.check = jest.fn(async () => ({ pwned: true, count: 42, available: true }));
    const result = await fixture.service.validate('Tr0ub4dor-Hummingbird-9!plate', {
      username: 'someone-else',
      email: 'else@example.com',
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual({ code: 'HIBP_PWNED', params: { count: 42 } });
  });
}

export function registerReturnsSanitizedPublicPolicyWithoutInternalFlagsCases(
  fixture: ReturnType<typeof registerPasswordPolicyServiceFixture>,
) {
  it('returns sanitized public policy without internal flags', async () => {
    const result = await fixture.service.getPublicPolicy();
    expect(result).toEqual({
      minLength: 12,
      maxLength: 128,
      allowAllUnicode: true,
      requireUppercase: false,
      requireLowercase: false,
      requireDigit: false,
      requireSpecial: false,
      minZxcvbnScore: 3,
    });
    expect(result).not.toHaveProperty('checkHIBP');
    expect(result).not.toHaveProperty('checkCommonPasswords');
    expect(result).not.toHaveProperty('historySize');
  });
}

export function registerSeedsDefaultsWhenNoRowExistsCases(
  fixture: ReturnType<typeof registerPasswordPolicyServiceFixture>,
) {
  it('seeds defaults when no row exists', async () => {
    fixture.repo.findOne = jest.fn(async () => null);
    await fixture.service.ensureSeed();
    expect(fixture.repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 1, ...DEFAULT_PASSWORD_POLICY }));
  });
}

export function registerSkipsHibpWhenPolicyCheckHibpIsFalseCases(
  fixture: ReturnType<typeof registerPasswordPolicyServiceFixture>,
) {
  it('skips HIBP when policy.checkHIBP is false', async () => {
    fixture.repo.findOne = jest.fn(async () => fixture.buildRow({ checkHIBP: false }));
    await fixture.service.validate('Tr0ub4dor-Hummingbird-9!plate', {
      username: 'someone-else',
      email: 'else@example.com',
    });
    expect(fixture.hibp.check).not.toHaveBeenCalled();
  });
}
