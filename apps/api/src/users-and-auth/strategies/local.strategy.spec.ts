import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { LocalStrategy } from './local.strategy';
import { AuthService } from '../auth/auth.service';
import { TwoFactorService } from '../auth/two-factor.service';
import { User } from '@attraccess/database-entities';

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
            getUserByUsernameAndAuthenticationDetails: jest.fn(),
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
      .spyOn(authService, 'getUserByUsernameAndAuthenticationDetails')
      .mockResolvedValue(user as User);

    const result = await localStrategy.validate({ body: {} } as Request, 'testuser', 'password2');
    expect(result).toEqual(user);
    expect(twoFactorService.assertTwoFactorForLogin).toHaveBeenCalledWith(user, undefined);
  });

  it('should throw an UnauthorizedException if validation fails', async () => {
    jest
      .spyOn(authService, 'getUserByUsernameAndAuthenticationDetails')
      .mockResolvedValue(null);

    await expect(localStrategy.validate({ body: {} } as Request, 'testuser', 'wrongpassword')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
