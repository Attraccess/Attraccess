import { registerPasswordPolicyServiceFixture } from './password-policy.service.password-policy-service.test-fixture';
export function registerUpdatePolicyHotReloadCases(fixture: ReturnType<typeof registerPasswordPolicyServiceFixture>) {
  describe('updatePolicy (hot reload)', () => {
    it('persists partial updates and returns the next read from DB', async () => {
      let state = fixture.buildRow();
      fixture.repo.findOne = jest.fn(async () => state);
      fixture.repo.save = jest.fn(async (row) => {
        state = { ...state, ...row };
        return state;
      });
      const after = await fixture.service.updatePolicy({ minLength: 20, requireUppercase: true });
      expect(after.minLength).toBe(20);
      expect(after.requireUppercase).toBe(true);
    });

    it('next validate() call sees the freshly written policy (no cache)', async () => {
      let state = fixture.buildRow();
      fixture.repo.findOne = jest.fn(async () => state);
      fixture.repo.save = jest.fn(async (row) => {
        state = { ...state, ...row };
        return state;
      });
      await fixture.service.updatePolicy({ minLength: 50 });
      const result = await fixture.service.validate('Tr0ub4dor-Hummingbird-9!plate', {
        username: 'else',
        email: 'else@example.com',
      });
      expect(result.errors.map((e) => e.code)).toContain('MIN_LENGTH');
    });
  });
}
