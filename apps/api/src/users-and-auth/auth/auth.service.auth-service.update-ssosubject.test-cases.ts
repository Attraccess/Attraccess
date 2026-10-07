import { UpdateResult } from 'typeorm';
import { registerAuthServiceFixture } from './auth.service.auth-service.test-fixture';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));
export function registerUpdateSsosubjectCases(fixture: ReturnType<typeof registerAuthServiceFixture>) {
  describe('updateSSOSubject', () => {
    it('updates the ssoSubject on the given detail row', async () => {
      jest.spyOn(fixture.authenticationDetailRepository, 'update').mockResolvedValue({ affected: 1 } as UpdateResult);

      await fixture.authService.updateSSOSubject(5, 'new-sub-xyz');

      expect(fixture.authenticationDetailRepository.update).toHaveBeenCalledWith(5, { ssoSubject: 'new-sub-xyz' });
    });
  });
}
