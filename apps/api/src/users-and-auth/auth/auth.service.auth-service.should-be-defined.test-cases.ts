import { registerAuthServiceFixture } from './auth.service.auth-service.test-fixture';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));
export function registerShouldBeDefinedCases(fixture: ReturnType<typeof registerAuthServiceFixture>) {
  it('should be defined', () => {
    expect(fixture.authService).toBeDefined();
  });
}
