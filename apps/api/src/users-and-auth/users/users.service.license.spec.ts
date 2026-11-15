import { LicenseError, LicenseService } from '../../license/license.service';
import { registerUsersServiceFixture } from './users.service.users-service.test-fixture';

describe('UsersService license checks', () => {
  const fixture = registerUsersServiceFixture();

  describe('ensureLicenseForNewUsers', () => {
    // runs the real LicenseService.verifyLicense against a license with the given user limit
    const withLimit = (limit: number | undefined) => {
      const license = new LicenseService({} as never, {} as never);
      jest.spyOn(license, 'getLicenseData').mockResolvedValue({
        valid: true,
        modules: [],
        usageLimits: { users: limit },
        isNonProfit: false,
      });
      fixture.licenseService.verifyLicense.mockImplementation((requirements) => license.verifyLicense(requirements));
    };
    const withUsers = (count: number) => jest.spyOn(fixture.userRepository, 'count').mockResolvedValue(count);

    it('allows an invite that brings the total exactly to the limit', async () => {
      withLimit(10);
      withUsers(9);
      await expect(fixture.service.ensureLicenseForNewUsers(1)).resolves.toBeUndefined();
    });

    it('allows several invites that fill the limit exactly', async () => {
      withLimit(10);
      withUsers(7);
      await expect(fixture.service.ensureLicenseForNewUsers(3)).resolves.toBeUndefined();
    });

    it('refuses an invite that would exceed the limit', async () => {
      withLimit(10);
      withUsers(9);
      await expect(fixture.service.ensureLicenseForNewUsers(2)).rejects.toThrow(LicenseError);
    });

    it('refuses an invite when the limit is already reached', async () => {
      withLimit(10);
      withUsers(10);
      await expect(fixture.service.ensureLicenseForNewUsers(1)).rejects.toThrow(LicenseError);
    });

    it('skips the license check when nobody is invited', async () => {
      await fixture.service.ensureLicenseForNewUsers(0);
      expect(fixture.licenseService.verifyLicense).not.toHaveBeenCalled();
    });

    it.each([undefined, 0, -1, Infinity])('allows invites when the user limit is %p (unlimited)', async (limit) => {
      withLimit(limit);
      withUsers(500);
      await expect(fixture.service.ensureLicenseForNewUsers(5)).resolves.toBeUndefined();
    });
  });
});
