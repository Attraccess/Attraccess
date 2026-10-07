import { AuthenticationDetail, AuthenticationType, User } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { CreateUserDto } from './dtos/createUser.dto';
import { ForbiddenSignupDomainException } from './errors/forbiddenSignupDomain.exception';
import { EntityManager } from 'typeorm';
import { registerUserRegistrationServiceFixture } from './user-registration.service.user-registration-service.test-fixture';
export function registerCreateOneCases(fixture: ReturnType<typeof registerUserRegistrationServiceFixture>) {
  describe('createOne', () => {
    it('should create a new user', async () => {
      fixture.settingRepository.findOne.mockResolvedValue({ value: '*' });
      const user = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
      } as User;

      jest.spyOn(fixture.usersService, 'createOne').mockResolvedValue(user);
      jest.spyOn(fixture.authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(fixture.authService, 'addAuthenticationDetails').mockResolvedValue({
        id: 1,
        userId: 1,
        type: AuthenticationType.LOCAL_PASSWORD,
        password: 'hashed-password',
        user: {} as User,
      });

      const createUserDto: CreateUserDto = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      };

      const response = await fixture.service.createOne(createUserDto);
      expect(response).toEqual(user);
      expect(fixture.authService.addAuthenticationDetails).toHaveBeenCalledWith(
        user.id,
        { type: AuthenticationType.LOCAL_PASSWORD, details: { password: createUserDto.password } },
        expect.anything(),
        'hashed-password',
      );
      expect(fixture.emailService.sendVerificationEmail).toHaveBeenCalledWith(user, 'verification-token');
      expect(fixture.usersService.withTransaction).toHaveBeenCalled();
      expect(fixture.usersService.recordCreatedUser).toHaveBeenCalledWith(user);
    });

    it('sends the verification email after the registration transaction commits', async () => {
      fixture.settingRepository.findOne.mockResolvedValue({ value: '*' });
      const user = { id: 1, username: 'testuser', email: 'test@example.com' } as User;
      jest.spyOn(fixture.usersService, 'createOne').mockResolvedValue(user);
      jest.spyOn(fixture.authService, 'addAuthenticationDetails').mockResolvedValue({ id: 1 } as AuthenticationDetail);
      jest.spyOn(fixture.authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(fixture.usersService, 'withTransaction').mockImplementation(async (handler) => {
        const result = await handler({} as EntityManager);
        expect(fixture.emailService.sendVerificationEmail).not.toHaveBeenCalled();
        return result;
      });

      await fixture.service.createOne({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      });

      expect(fixture.emailService.sendVerificationEmail).toHaveBeenCalledWith(user, 'verification-token');
    });

    it('should throw if email domain is not whitelisted', async () => {
      fixture.settingRepository.findOne.mockResolvedValue({ value: 'example.com, allowed.com' });

      const createUserDto: CreateUserDto = {
        username: 'testuser',
        email: 'notallowed@bar.com',
        password: 'password',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      };

      await expect(fixture.service.createOne(createUserDto)).rejects.toBeInstanceOf(ForbiddenSignupDomainException);
    });

    it('should allow when email domain is whitelisted', async () => {
      fixture.settingRepository.findOne.mockResolvedValue({ value: 'allowed.com' });
      const user = {
        id: 2,
        username: 'alice',
        email: 'alice@allowed.com',
      } as User;

      jest.spyOn(fixture.usersService, 'createOne').mockResolvedValue(user);
      jest.spyOn(fixture.authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(fixture.authService, 'addAuthenticationDetails').mockResolvedValue({
        id: 2,
        userId: 2,
        type: AuthenticationType.LOCAL_PASSWORD,
        password: 'hashed',
        user: {} as User,
      });

      const dto: CreateUserDto = {
        username: 'alice',
        email: 'alice@allowed.com',
        password: 'password',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      };

      const response = await fixture.service.createOne(dto);
      expect(response).toEqual(user);
      expect(fixture.emailService.sendVerificationEmail).toHaveBeenCalledWith(user, 'verification-token');
    });

    it('fails before registration when SMTP is not configured', async () => {
      fixture.settingRepository.findOne.mockResolvedValue({ value: '*' });
      jest
        .spyOn(fixture.emailService, 'assertSmtpConfigured')
        .mockRejectedValue(new Error('SMTP configuration not set'));

      const result = fixture.service.createOne({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      });

      await expect(result).rejects.toBeInstanceOf(BadRequestException);
      await expect(result).rejects.toMatchObject({
        response: {
          message: 'SMTP is not configured. Configure email before sending email.',
          statusCode: 400,
        },
      });
      expect(fixture.usersService.withTransaction).not.toHaveBeenCalled();
      expect(fixture.usersService.rollbackFailedRegistration).not.toHaveBeenCalled();
      expect(fixture.usersService.recordCreatedUser).not.toHaveBeenCalled();
      expect(fixture.emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('rolls back the registration when sending the verification email fails', async () => {
      fixture.settingRepository.findOne.mockResolvedValue({ value: '*' });
      const user = { id: 1, username: 'testuser', email: 'test@example.com' } as User;
      jest.spyOn(fixture.usersService, 'createOne').mockResolvedValue(user);
      jest.spyOn(fixture.authService, 'addAuthenticationDetails').mockResolvedValue({ id: 1 } as AuthenticationDetail);
      jest.spyOn(fixture.authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest
        .spyOn(fixture.emailService, 'sendVerificationEmail')
        .mockRejectedValue(Object.assign(new Error('SMTP unavailable'), { code: 'ECONNREFUSED' }));

      await expect(
        fixture.service.createOne({
          username: 'testuser',
          email: 'test@example.com',
          password: 'password',
          strategy: AuthenticationType.LOCAL_PASSWORD,
        }),
      ).rejects.toMatchObject({ response: { message: 'EmailSendFailed', statusCode: 503 } });
      expect(fixture.usersService.rollbackFailedRegistration).toHaveBeenCalledWith(user.id);
      expect(fixture.usersService.recordCreatedUser).not.toHaveBeenCalled();
    });

    it('does not map transaction failures as email-send failures', async () => {
      fixture.settingRepository.findOne.mockResolvedValue({ value: '*' });
      const transactionError = Object.assign(new Error('Database unavailable'), { code: 'ECONNREFUSED' });
      jest.spyOn(fixture.usersService, 'withTransaction').mockRejectedValue(transactionError);

      await expect(
        fixture.service.createOne({
          username: 'testuser',
          email: 'test@example.com',
          password: 'password',
          strategy: AuthenticationType.LOCAL_PASSWORD,
        }),
      ).rejects.toBe(transactionError);
      expect(fixture.emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('hashes the password before opening the registration transaction', async () => {
      fixture.settingRepository.findOne.mockResolvedValue({ value: '*' });
      const user = { id: 1, username: 'testuser', email: 'test@example.com' } as User;
      jest.spyOn(fixture.usersService, 'createOne').mockResolvedValue(user);
      jest.spyOn(fixture.authService, 'addAuthenticationDetails').mockResolvedValue({ id: 1 } as AuthenticationDetail);
      jest.spyOn(fixture.authService, 'generateEmailVerificationToken').mockResolvedValue('verification-token');
      jest.spyOn(fixture.usersService, 'withTransaction').mockImplementation(async (handler) => {
        expect(fixture.authService.hashPassword).toHaveBeenCalledWith('password');
        return handler({} as EntityManager);
      });

      await fixture.service.createOne({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password',
        strategy: AuthenticationType.LOCAL_PASSWORD,
      });
    });
  });
}
