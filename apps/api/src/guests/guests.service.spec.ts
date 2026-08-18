import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { AuthenticationDetail, AuthenticationType, ResourceIntroduction, User, UserType } from '@attraccess/database-entities';
import { verify } from 'otplib';
import { GuestsService } from './guests.service';
import { EncryptionService } from '../encryption/encryption.service';
import { SettingsService } from '../settings/settings.service';
import { BruteForceProtectionService } from '../users-and-auth/rate-limiting/brute-force.service';
import { UsersService } from '../users-and-auth/users/users.service';
import { MetricsService } from '../metrics/metrics.service';

jest.mock('otplib', () => ({
  verify: jest.fn(),
  generateSecret: jest.fn().mockReturnValue('JBSWY3DPEHPK3PXP'),
  generateURI: jest.fn().mockReturnValue('otpauth://totp/Attraccess:guest?secret=JBSWY3DPEHPK3PXP'),
}));

const mockedVerify = verify as jest.Mock;

describe('GuestsService', () => {
  let service: GuestsService;
  let userRepository: {
    findOne: jest.Mock;
    findAndCount: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let authDetailRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let encryptionService: { encrypt: jest.Mock; decryptIfEncrypted: jest.Mock };
  let bruteForce: {
    assertIpAllowed: jest.Mock;
    assertAccountAllowed: jest.Mock;
    recordFailure: jest.Mock;
    recordSuccess: jest.Mock;
  };
  let usersService: { deleteOne: jest.Mock };

  const makeGuest = (partial: Partial<User> = {}): User =>
    ({
      id: 1,
      username: 'John Doe',
      email: null,
      userType: UserType.GUEST,
      guestCode: '1234',
      guestEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...partial,
    }) as User;

  beforeEach(async () => {
    userRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      save: jest.fn().mockImplementation(async (user: User) => ({ id: 1, ...user })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
    };
    authDetailRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation(async (detail) => detail),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    encryptionService = {
      encrypt: jest.fn().mockImplementation((value: string) => `encrypted:${value}`),
      decryptIfEncrypted: jest.fn().mockImplementation((value: string) =>
        typeof value === 'string' && value.startsWith('encrypted:') ? value.slice('encrypted:'.length) : value,
      ),
    };
    bruteForce = {
      assertIpAllowed: jest.fn().mockResolvedValue(undefined),
      assertAccountAllowed: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
      recordSuccess: jest.fn().mockResolvedValue(undefined),
    };
    usersService = { deleteOne: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuestsService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(AuthenticationDetail), useValue: authDetailRepository },
        { provide: getRepositoryToken(ResourceIntroduction), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: EncryptionService, useValue: encryptionService },
        { provide: SettingsService, useValue: { getUrl: jest.fn().mockResolvedValue('http://localhost:3000') } },
        { provide: BruteForceProtectionService, useValue: bruteForce },
        { provide: UsersService, useValue: usersService },
        {
          provide: MetricsService,
          useValue: { usersTotal: { inc: jest.fn(), dec: jest.fn() } },
        },
      ],
    }).compile();

    service = module.get(GuestsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates a guest with a 4-digit code and provisions a credential', async () => {
      const { guest, enrollment } = await service.create({ name: 'John Doe' });

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'John Doe',
          userType: UserType.GUEST,
          guestEnabled: true,
        }),
      );
      const savedUser = (userRepository.save.mock.calls[0][0] as User);
      expect(savedUser.guestCode).toMatch(/^\d{4}$/);
      expect(guest.userType).toBe(UserType.GUEST);
      expect(enrollment.secret).toBe('JBSWY3DPEHPK3PXP');
      expect(enrollment.otpauthUrl).toContain('otpauth://');
      expect(authDetailRepository.save).toHaveBeenCalled();
    });

    it('rejects a duplicate guest name (case-insensitive)', async () => {
      userRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(makeGuest({ username: 'john doe' })),
      });

      await expect(service.create({ name: 'John Doe' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyGuestOtp', () => {
    it('returns the guest on a valid code and records the consumed time step', async () => {
      userRepository.findOne.mockResolvedValue(makeGuest());
      authDetailRepository.findOne.mockResolvedValue({
        id: 5,
        userId: 1,
        type: AuthenticationType.GUEST_OTP,
        totpSecret: 'encrypted:SECRET',
        totpLastTimeStep: null,
      });
      mockedVerify.mockResolvedValue({ valid: true, delta: 0, timeStep: 100 });

      const result = await service.verifyGuestOtp('1234', '123456', '1.2.3.4');

      expect(result.id).toBe(1);
      expect(mockedVerify).toHaveBeenCalledWith(
        expect.objectContaining({ secret: 'SECRET', token: '123456', afterTimeStep: undefined }),
      );
      expect(authDetailRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ totpLastTimeStep: 100 }),
      );
      expect(bruteForce.recordSuccess).toHaveBeenCalled();
    });

    it('passes the stored time step for replay protection', async () => {
      userRepository.findOne.mockResolvedValue(makeGuest());
      authDetailRepository.findOne.mockResolvedValue({
        id: 5,
        userId: 1,
        type: AuthenticationType.GUEST_OTP,
        totpSecret: 'encrypted:SECRET',
        totpLastTimeStep: 99,
      });
      mockedVerify.mockResolvedValue({ valid: true, delta: 0, timeStep: 100 });

      await service.verifyGuestOtp('1234', '123456', '1.2.3.4');

      expect(mockedVerify).toHaveBeenCalledWith(expect.objectContaining({ afterTimeStep: 99 }));
    });

    it('rejects an invalid code and records a failure', async () => {
      userRepository.findOne.mockResolvedValue(makeGuest());
      authDetailRepository.findOne.mockResolvedValue({
        id: 5,
        userId: 1,
        type: AuthenticationType.GUEST_OTP,
        totpSecret: 'encrypted:SECRET',
        totpLastTimeStep: null,
      });
      mockedVerify.mockResolvedValue({ valid: false });

      await expect(service.verifyGuestOtp('1234', '000000', '1.2.3.4')).rejects.toThrow(UnauthorizedException);
      expect(bruteForce.recordFailure).toHaveBeenCalled();
    });

    it('rejects an unknown guest code', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.verifyGuestOtp('9999', '123456', '1.2.3.4')).rejects.toThrow(UnauthorizedException);
      expect(bruteForce.recordFailure).toHaveBeenCalled();
    });

    it('rejects a disabled guest', async () => {
      userRepository.findOne.mockResolvedValue(makeGuest({ guestEnabled: false }));

      await expect(service.verifyGuestOtp('1234', '123456', '1.2.3.4')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a guest without a credential', async () => {
      userRepository.findOne.mockResolvedValue(makeGuest());
      authDetailRepository.findOne.mockResolvedValue(null);

      await expect(service.verifyGuestOtp('1234', '123456', '1.2.3.4')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('rotate / revoke', () => {
    it('rotate issues a new secret and resets the replay counter', async () => {
      userRepository.findOne.mockResolvedValue(makeGuest());
      authDetailRepository.findOne.mockResolvedValue({
        id: 5,
        userId: 1,
        type: AuthenticationType.GUEST_OTP,
        totpSecret: 'encrypted:OLD',
        totpLastTimeStep: 42,
      });

      const enrollment = await service.rotate(1);

      expect(enrollment.secret).toBe('JBSWY3DPEHPK3PXP');
      expect(authDetailRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ totpLastTimeStep: null, totpSecret: 'encrypted:JBSWY3DPEHPK3PXP' }),
      );
    });

    it('revoke deletes the credential', async () => {
      userRepository.findOne.mockResolvedValue(makeGuest());
      authDetailRepository.findOne.mockResolvedValue({ id: 5, userId: 1, type: AuthenticationType.GUEST_OTP });

      await service.revokeCredential(1);

      expect(authDetailRepository.delete).toHaveBeenCalledWith(5);
    });

    it('getEnrollment throws when there is no credential', async () => {
      userRepository.findOne.mockResolvedValue(makeGuest());
      authDetailRepository.findOne.mockResolvedValue(null);

      await expect(service.getEnrollment(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('releases the guest code and delegates to user deletion', async () => {
      userRepository.findOne.mockResolvedValue(makeGuest());

      await service.delete(1);

      expect(userRepository.update).toHaveBeenCalledWith(1, { guestCode: null });
      expect(usersService.deleteOne).toHaveBeenCalledWith(1);
    });

    it('refuses to delete a non-guest user', async () => {
      userRepository.findOne.mockResolvedValue(makeGuest({ userType: UserType.MEMBER }));

      await expect(service.delete(1)).rejects.toThrow(NotFoundException);
      expect(usersService.deleteOne).not.toHaveBeenCalled();
    });
  });
});
