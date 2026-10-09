import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { LocalStrategy } from './local.strategy';
import { AuthService } from '../auth/auth.service';
import { TwoFactorService } from '../auth/two-factor.service';
import { AuthenticationType, User } from '@attraccess/database-entities';

describe('LocalStrategy', () => {
  let localStrategy: LocalStrategy;
  let authService: AuthService;
  let twoFactorService: TwoFactorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalStrategy,
        {
          provide: AuthService,
          useValue: {
            getUserByLoginIdentifierAndAuthenticationDetails: jest.fn(),
          },
        },
        {
          provide: TwoFactorService,
          useValue: {
            assertTwoFactorForLogin: jest.fn(),
          },
        },
      ],
    }).compile();

    localStrategy = module.get<LocalStrategy>(LocalStrategy);
    authService = module.get<AuthService>(AuthService);
    twoFactorService = module.get<TwoFactorService>(TwoFactorService);
  });

  it('should return a user if validation is successful', async () => {
    const user: Partial<User> = { id: 1, username: 'testuser' }; // Mock user object
    jest
      .spyOn(authService, 'getUserByLoginIdentifierAndAuthenticationDetails')
      .mockResolvedValue(user as User);

    const result = await localStrategy.validate({ body: {} } as Request, 'testuser', 'password2');
    expect(result).toEqual(user);
    expect(twoFactorService.assertTwoFactorForLogin).toHaveBeenCalledWith(user, undefined);
  });

  it('should throw an UnauthorizedException if validation fails', async () => {
    jest
      .spyOn(authService, 'getUserByLoginIdentifierAndAuthenticationDetails')
      .mockResolvedValue(null);

    await expect(localStrategy.validate({ body: {} } as Request, 'testuser', 'wrongpassword')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(twoFactorService.assertTwoFactorForLogin).not.toHaveBeenCalled();
  });
  it.each(['TwoFactorRequired', 'TwoFactorInvalidCode'])('propagates %s only after credentials pass', async (message) => {
    const user = { id: 7 } as User;
    jest.spyOn(authService, 'getUserByLoginIdentifierAndAuthenticationDetails').mockResolvedValue(user);
    jest.spyOn(twoFactorService, 'assertTwoFactorForLogin').mockRejectedValue(new UnauthorizedException(message));
    await expect(localStrategy.validate({ body: { twoFactorCode: '012345' } } as Request, ' user@example.com ', ' password ')).rejects.toThrow(message);
    expect(authService.getUserByLoginIdentifierAndAuthenticationDetails).toHaveBeenCalledWith('user@example.com', {
      type: AuthenticationType.LOCAL_PASSWORD, details: { password: ' password ' },
    });
    expect(twoFactorService.assertTwoFactorForLogin).toHaveBeenCalledWith(user, '012345');
  });
  it('returns the user after a valid code', async () => {
    const user = { id: 7 } as User;
    jest.spyOn(authService, 'getUserByLoginIdentifierAndAuthenticationDetails').mockResolvedValue(user);
    await expect(localStrategy.validate({ body: { twoFactorCode: '012345' } } as Request, 'user', 'password')).resolves.toBe(user);
    expect(twoFactorService.assertTwoFactorForLogin).toHaveBeenCalledWith(user, '012345');
  });

});
