import { PasswordPolicyRole } from '@attraccess/database-entities';
import { registerPasswordPolicyServiceFixture } from './password-policy.service.password-policy-service.test-fixture';
export function registerRoleOverridesCases(fixture: ReturnType<typeof registerPasswordPolicyServiceFixture>) {
  describe('role overrides', () => {
    it('getEffectivePolicy returns base when no role provided', async () => {
      const effective = await fixture.service.getEffectivePolicy();
      expect(effective.minLength).toBe(12);
      expect(fixture.overrideRepo.findOne).not.toHaveBeenCalled();
    });

    it('getEffectivePolicy returns base when no override row exists', async () => {
      const effective = await fixture.service.getEffectivePolicy(PasswordPolicyRole.ADMIN);
      expect(effective.minLength).toBe(12);
      expect(fixture.overrideRepo.findOne).toHaveBeenCalledWith({ where: { role: PasswordPolicyRole.ADMIN } });
    });

    it('getEffectivePolicy merges override fields over base', async () => {
      fixture.overrideRepo.findOne = jest.fn(async () =>
        fixture.buildOverride({ role: PasswordPolicyRole.ADMIN, minLength: 24, requireSpecial: true }),
      );
      const effective = await fixture.service.getEffectivePolicy(PasswordPolicyRole.ADMIN);
      expect(effective.minLength).toBe(24);
      expect(effective.requireSpecial).toBe(true);
      expect(effective.maxLength).toBe(128);
    });

    it('null override fields fall back to base', async () => {
      fixture.overrideRepo.findOne = jest.fn(async () =>
        fixture.buildOverride({ role: PasswordPolicyRole.ADMIN, minLength: 20 }),
      );
      const effective = await fixture.service.getEffectivePolicy(PasswordPolicyRole.ADMIN);
      expect(effective.minLength).toBe(20);
      expect(effective.requireUppercase).toBe(false);
    });

    it('validate honours role-specific policy via getEffectivePolicy', async () => {
      fixture.overrideRepo.findOne = jest.fn(async () =>
        fixture.buildOverride({ role: PasswordPolicyRole.ADMIN, minLength: 24 }),
      );
      const result = await fixture.service.validate(
        'short-pw-1A!',
        { username: 'a', email: 'a@x.de' },
        { role: PasswordPolicyRole.ADMIN },
      );
      expect(result.errors.map((e) => e.code)).toContain('MIN_LENGTH');
    });

    it('upsertOverride creates a new row with null defaults plus provided fields', async () => {
      fixture.overrideRepo.findOne = jest.fn(async () => null);
      await fixture.service.upsertOverride(PasswordPolicyRole.ADMIN, { minLength: 32 });
      expect(fixture.overrideRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          role: PasswordPolicyRole.ADMIN,
          minLength: 32,
          maxLength: null,
        }),
      );
    });

    it('upsertOverride merges into existing row', async () => {
      const existing = fixture.buildOverride({ role: PasswordPolicyRole.ADMIN, minLength: 16 });
      fixture.overrideRepo.findOne = jest.fn(async () => existing);
      await fixture.service.upsertOverride(PasswordPolicyRole.ADMIN, { minLength: 32, requireSpecial: true });
      expect(fixture.overrideRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ minLength: 32, requireSpecial: true }),
      );
    });

    it('upsertOverride rejects when post-merge minLength exceeds global maxLength', async () => {
      fixture.repo.findOne = jest.fn(async () => fixture.buildRow({ minLength: 12, maxLength: 16 }));
      fixture.overrideRepo.findOne = jest.fn(async () => null);
      await expect(fixture.service.upsertOverride(PasswordPolicyRole.ADMIN, { minLength: 32 })).rejects.toThrow(
        /minLength/,
      );
    });

    it('updatePolicy rejects when new global minLength exceeds existing override maxLength', async () => {
      const existing = fixture.buildOverride({ role: PasswordPolicyRole.ADMIN, maxLength: 16 });
      fixture.repo.findOne = jest.fn(async () => fixture.buildRow());
      fixture.overrideRepo.find = jest.fn(async () => [existing]);
      await expect(fixture.service.updatePolicy({ minLength: 32 })).rejects.toThrow(/minLength/);
    });

    it('deleteOverride throws when role has no override row', async () => {
      fixture.overrideRepo.findOne = jest.fn(async () => null);
      await expect(fixture.service.deleteOverride(PasswordPolicyRole.ADMIN)).rejects.toThrow();
    });

    it('resolveRole returns admin for request-bound users with system.settings.manage permission', async () => {
      const role = await fixture.service.resolveRole({
        effectivePermissions: new Set(['system.settings.manage']),
      } as never);
      expect(role).toBe(PasswordPolicyRole.ADMIN);
    });

    it('resolveRole returns undefined for request-bound users without system.settings.manage', async () => {
      const role = await fixture.service.resolveRole({
        effectivePermissions: new Set<string>(),
      } as never);
      expect(role).toBeUndefined();
    });

    it('resolveRole queries DB for plain DB-loaded users and returns admin when they have the permission', async () => {
      fixture.rbacService.getEffectivePermissions = jest.fn(async () => new Set(['system.settings.manage']));
      const role = await fixture.service.resolveRole({ id: 42 } as never);
      expect(fixture.rbacService.getEffectivePermissions).toHaveBeenCalledWith(42);
      expect(role).toBe(PasswordPolicyRole.ADMIN);
    });

    it('resolveRole queries DB for plain DB-loaded users and returns undefined when they lack the permission', async () => {
      fixture.rbacService.getEffectivePermissions = jest.fn(async () => new Set<string>());
      const role = await fixture.service.resolveRole({ id: 42 } as never);
      expect(role).toBeUndefined();
    });
  });
}
