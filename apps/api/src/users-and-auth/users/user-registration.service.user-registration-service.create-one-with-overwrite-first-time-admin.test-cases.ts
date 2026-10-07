import { AuthenticationDetail, AuthenticationType, User } from '@attraccess/database-entities';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CreateUserDto } from './dtos/createUser.dto';
import { EntityManager } from 'typeorm';
import { registerUserRegistrationServiceFixture } from './user-registration.service.user-registration-service.test-fixture';
export function registerCreateOneWithOverwriteFirstTimeAdminCases(
  fixture: ReturnType<typeof registerUserRegistrationServiceFixture>,
) {
  describe('createOne with overwriteFirstTimeAdmin', () => {
    const unverifiedAdmin = {
      id: 1,
      username: 'admin',
      email: 'wrong@example.com',
      isEmailVerified: false,
    } as User;

    const newAdmin = { ...unverifiedAdmin, id: 2, email: 'correct@example.com' } as User;

    const dto: CreateUserDto & { overwriteFirstTimeAdmin: true } = {
      username: 'admin',
      email: 'correct@example.com',
      password: 'password123',
      strategy: AuthenticationType.LOCAL_PASSWORD,
      overwriteFirstTimeAdmin: true,
    };

    beforeEach(() => {
      fixture.settingRepository.findOne.mockResolvedValue({ value: '*' });
    });

    it('creates the replacement administrator before deleting the existing unverified admin', async () => {
      jest.spyOn(fixture.usersService, 'releaseFirstTimeSetupAdminIdentifiers').mockResolvedValue(unverifiedAdmin);
      jest.spyOn(fixture.usersService, 'deleteOne').mockResolvedValue(undefined);
      jest.spyOn(fixture.usersService, 'createOne').mockResolvedValue(newAdmin);
      jest.spyOn(fixture.authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(fixture.authService, 'addAuthenticationDetails').mockResolvedValue({
        id: 1,
        userId: newAdmin.id,
        type: AuthenticationType.LOCAL_PASSWORD,
        password: 'hashed',
        user: {} as User,
      });

      const result = await fixture.service.createOne(dto);

      expect(fixture.usersService.deleteOne).toHaveBeenCalledWith(unverifiedAdmin.id);
      expect(fixture.usersService.releaseFirstTimeSetupAdminIdentifiers).toHaveBeenCalledWith(expect.anything());
      expect(fixture.usersService.createOne).toHaveBeenCalledWith(
        expect.objectContaining({ isFirstTimeSetupAdmin: true }),
        expect.anything(),
        { excludedUserIdFromLicenseUsage: unverifiedAdmin.id },
      );
      expect(fixture.emailService.sendVerificationEmail).toHaveBeenCalledWith(newAdmin, 'verification-token');
      expect((fixture.emailService.sendVerificationEmail as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
        (fixture.usersService.deleteOne as jest.Mock).mock.invocationCallOrder[0],
      );
      expect(result).toEqual(newAdmin);
    });

    it('preserves the existing administrator when SMTP is not configured', async () => {
      jest
        .spyOn(fixture.emailService, 'assertSmtpConfigured')
        .mockRejectedValue(new Error('SMTP configuration not set'));

      await expect(fixture.service.createOne(dto)).rejects.toBeInstanceOf(BadRequestException);

      expect(fixture.usersService.deleteOne).not.toHaveBeenCalled();
      expect(fixture.usersService.createOne).not.toHaveBeenCalled();
      expect(fixture.usersService.rollbackFailedRegistration).not.toHaveBeenCalled();
    });

    it('preserves the existing administrator when sending the replacement verification email fails', async () => {
      jest.spyOn(fixture.usersService, 'releaseFirstTimeSetupAdminIdentifiers').mockResolvedValue(unverifiedAdmin);
      jest.spyOn(fixture.usersService, 'createOne').mockResolvedValue(newAdmin);
      jest.spyOn(fixture.authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(fixture.authService, 'addAuthenticationDetails').mockResolvedValue({ id: 1 } as AuthenticationDetail);
      jest
        .spyOn(fixture.emailService, 'sendVerificationEmail')
        .mockRejectedValue(Object.assign(new Error('SMTP unavailable'), { code: 'ECONNREFUSED' }));

      await expect(fixture.service.createOne(dto)).rejects.toMatchObject({
        response: { message: 'EmailSendFailed', statusCode: 503 },
      });

      expect(fixture.usersService.rollbackFirstTimeSetupAdminReplacement).toHaveBeenCalledWith(
        newAdmin.id,
        unverifiedAdmin,
      );
      expect(fixture.usersService.deleteOne).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the transactional setup check rejects the replacement', async () => {
      jest
        .spyOn(fixture.usersService, 'releaseFirstTimeSetupAdminIdentifiers')
        .mockRejectedValue(new ForbiddenException('First-time setup is already complete'));

      await expect(fixture.service.createOne(dto)).rejects.toThrow(ForbiddenException);
      expect(fixture.usersService.deleteOne).not.toHaveBeenCalled();
      expect(fixture.usersService.createOne).not.toHaveBeenCalled();
    });

    it('rolls back the replacement when deletion of the existing administrator fails', async () => {
      const deletionError = new Error('Cannot delete administrator');
      jest.spyOn(fixture.usersService, 'releaseFirstTimeSetupAdminIdentifiers').mockResolvedValue(unverifiedAdmin);
      jest.spyOn(fixture.usersService, 'createOne').mockResolvedValue(newAdmin);
      jest.spyOn(fixture.authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(fixture.authService, 'addAuthenticationDetails').mockResolvedValue({ id: 1 } as AuthenticationDetail);
      jest.spyOn(fixture.usersService, 'deleteOne').mockRejectedValue(deletionError);

      await expect(fixture.service.createOne(dto)).rejects.toBe(deletionError);

      expect(fixture.usersService.rollbackFirstTimeSetupAdminReplacement).toHaveBeenCalledWith(
        newAdmin.id,
        unverifiedAdmin,
      );
      expect(fixture.usersService.recordCreatedUser).not.toHaveBeenCalled();
    });

    it('serializes concurrent overwrite requests and revalidates each request in its transaction', async () => {
      let releaseFirstTransaction!: () => void;
      let signalFirstTransactionStarted!: () => void;
      const firstTransactionStarted = new Promise<void>((resolve) => {
        signalFirstTransactionStarted = resolve;
      });

      jest
        .spyOn(fixture.usersService, 'releaseFirstTimeSetupAdminIdentifiers')
        .mockResolvedValueOnce(unverifiedAdmin)
        .mockRejectedValueOnce(new ForbiddenException('First-time setup is already complete'));
      jest.spyOn(fixture.usersService, 'createOne').mockResolvedValue(newAdmin);
      jest.spyOn(fixture.authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(fixture.authService, 'addAuthenticationDetails').mockResolvedValue({ id: 1 } as AuthenticationDetail);
      jest
        .spyOn(fixture.usersService, 'withTransaction')
        .mockImplementationOnce(async (handler) => {
          signalFirstTransactionStarted();
          await new Promise<void>((resolve) => {
            releaseFirstTransaction = resolve;
          });
          return handler({} as EntityManager);
        })
        .mockImplementationOnce(async (handler) => handler({} as EntityManager));

      const firstRequest = fixture.service.createOne(dto);
      await firstTransactionStarted;
      const secondRequest = fixture.service.createOne(dto);

      await new Promise(setImmediate);
      expect(fixture.usersService.withTransaction).toHaveBeenCalledTimes(1);

      releaseFirstTransaction();
      const results = await Promise.allSettled([firstRequest, secondRequest]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect(fixture.usersService.releaseFirstTimeSetupAdminIdentifiers).toHaveBeenCalledTimes(2);
    });

    it('ignores the overwrite flag when not set (normal create flow)', async () => {
      jest.spyOn(fixture.usersService, 'createOne').mockResolvedValue(newAdmin);
      jest.spyOn(fixture.authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(fixture.authService, 'addAuthenticationDetails').mockResolvedValue({
        id: 1,
        userId: newAdmin.id,
        type: AuthenticationType.LOCAL_PASSWORD,
        password: 'hashed',
        user: {} as User,
      });

      const regularDto: CreateUserDto = {
        username: 'someone',
        email: 'someone@example.com',
        password: 'password123',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      };

      await fixture.service.createOne(regularDto);

      expect(fixture.usersService.deleteOne).not.toHaveBeenCalled();
      expect(fixture.usersService.releaseFirstTimeSetupAdminIdentifiers).not.toHaveBeenCalled();
    });
  });
}
