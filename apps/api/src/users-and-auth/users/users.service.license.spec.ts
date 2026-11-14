import { LicenseError } from '../../license/license.service';
import { registerUsersServiceFixture } from './users.service.users-service.test-fixture';

describe('UsersService license checks', () => {
  const fixture = registerUsersServiceFixture();

  describe('ensureLicenseForNewUsers', () => {
    // mirrors LicenseService.verifyLicense: usage >= limit is refused, a limit of -1 is unlimited
    const withLimit = (limit: number) =>
      fixture.licenseService.verifyLicense.mockImplementation(async ({ usageLimits }) => {
        const usage = usageLimits?.users ?? 0;
        if (limit !== -1 && usage >= limit) {
          throw new LicenseError('Trying to use more than the allowed amount of users');
        }
      });

    it('allows an invite that brings the total exactly to the limit', async () => {
      withLimit(10);
      jest.spyOn(fixture.userRepository, 'count').mockResolvedValue(9);
      await expect(fixture.service.ensureLicenseForNewUsers(1)).resolves.toBeUndefined();
    });

    it('allows several invites that fill the limit exactly', async () => {
      withLimit(10);
      jest.spyOn(fixture.userRepository, 'count').mockResolvedValue(7);
      await expect(fixture.service.ensureLicenseForNewUsers(3)).resolves.toBeUndefined();
    });

    it('refuses an invite that would exceed the limit', async () => {
      withLimit(10);
      jest.spyOn(fixture.userRepository, 'count').mockResolvedValue(9);
      await expect(fixture.service.ensureLicenseForNewUsers(2)).rejects.toThrow(LicenseError);
    });

    it('refuses an invite when the limit is already reached', async () => {
      withLimit(10);
      jest.spyOn(fixture.userRepository, 'count').mockResolvedValue(10);
      await expect(fixture.service.ensureLicenseForNewUsers(1)).rejects.toThrow(LicenseError);
    });

    it('skips the license check when nobody is invited', async () => {
      fixture.licenseService.verifyLicense.mockClear();
      await fixture.service.ensureLicenseForNewUsers(0);
      expect(fixture.licenseService.verifyLicense).not.toHaveBeenCalled();
    });

    it('allows invites when the license is unlimited', async () => {
      withLimit(-1);
      jest.spyOn(fixture.userRepository, 'count').mockResolvedValue(500);
      await expect(fixture.service.ensureLicenseForNewUsers(5)).resolves.toBeUndefined();
    });
  });
});
