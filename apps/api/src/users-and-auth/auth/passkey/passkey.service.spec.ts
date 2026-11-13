import { AuthAuditLogger } from '../../rate-limiting/auth-audit.logger';
import { BruteForceProtectionService } from '../../rate-limiting/brute-force.service';
import { AUDIT_RECORDER } from '../../../audit/recorder/audit-event';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Passkey, PasskeyChallenge, User } from '@attraccess/database-entities';
import { PasskeyService } from './passkey.service';
import { SettingsService } from '../../../settings/settings.service';
import { UserEmailNotVerifiedException } from '../errors/userEmailNotVerified.exception';

const verifyAuthenticationResponse = jest.fn();
jest.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: jest.fn().mockResolvedValue({ challenge: 'reg-challenge' }),
  generateAuthenticationOptions: jest.fn().mockResolvedValue({ challenge: 'auth-challenge' }),
  verifyRegistrationResponse: jest.fn(),
  verifyAuthenticationResponse: (...args: unknown[]) => verifyAuthenticationResponse(...args),
}));

function clientDataFor(challenge: string): string {
  return Buffer.from(JSON.stringify({ challenge, type: 'webauthn.get' })).toString('base64url');
}

describe('PasskeyService', () => {
  let service: PasskeyService;
  const origin = { actor: { id: 42, authenticationMethod: 'session' as const } };
  let passkeyRepo: Record<string, jest.Mock>;
  let challengeRepo: Record<string, jest.Mock>;
  let userRepo: Record<string, jest.Mock>;
  let getUrl: jest.Mock;
  let bruteForce: Record<string, jest.Mock>;
  let authAuditLog: jest.Mock;

  const storedPasskey = {
    id: 7,
    userId: 42,
    credentialId: 'cred-1',
    publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
    counter: 3,
    transports: 'internal,hybrid',
  } as Passkey;

  beforeEach(async () => {
    passkeyRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOneBy: jest.fn().mockResolvedValue(storedPasskey),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve(v)),
    };
    challengeRepo = {
      insert: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      findOneBy: jest.fn().mockResolvedValue(null),
    };
    userRepo = {
      findOneBy: jest.fn().mockResolvedValue({ id: 42, username: 'maker', isEmailVerified: true } as User),
    };
    getUrl = jest.fn().mockResolvedValue('https://make.example.com');
    bruteForce = {
      assertIpAllowed: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
      recordSuccess: jest.fn().mockResolvedValue(undefined),
    };
    authAuditLog = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: AUDIT_RECORDER, useValue: { record: jest.fn().mockResolvedValue({ status: 'recorded' }) } },
        { provide: BruteForceProtectionService, useValue: bruteForce },
        { provide: AuthAuditLogger, useValue: { log: authAuditLog } },
        PasskeyService,
        { provide: getRepositoryToken(Passkey), useValue: passkeyRepo },
        { provide: getRepositoryToken(PasskeyChallenge), useValue: challengeRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: SettingsService, useValue: { getUrl } },
      ],
    }).compile();

    service = module.get(PasskeyService);
    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 4, credentialBackedUp: true },
    });
  });

  describe('resolveRelyingParty', () => {
    it('uses the configured app URL and ignores a foreign request origin', async () => {
      const rp = await service.resolveRelyingParty('https://evil.example.org');

      expect(rp.rpID).toBe('make.example.com');
      expect(rp.expectedOrigin).toEqual(['https://make.example.com']);
    });

    it('also accepts a same-host request origin on another port (dev frontend proxy)', async () => {
      getUrl.mockResolvedValue('http://localhost:3001');

      const rp = await service.resolveRelyingParty('http://localhost:4201');

      expect(rp.rpID).toBe('localhost');
      expect(rp.expectedOrigin).toEqual(['http://localhost:3001', 'http://localhost:4201']);
    });

    it('falls back to the request origin when no app URL is configured', async () => {
      getUrl.mockResolvedValue(null);

      const rp = await service.resolveRelyingParty('http://localhost:4201');

      expect(rp.rpID).toBe('localhost');
      expect(rp.expectedOrigin).toEqual(['http://localhost:4201']);
    });

    it('rejects the ceremony when neither an app URL nor an origin is known', async () => {
      getUrl.mockResolvedValue(null);

      await expect(service.resolveRelyingParty(undefined)).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyAuthentication', () => {
    const response = { id: 'cred-1', response: { clientDataJSON: clientDataFor('auth-challenge') } };

    function issueChallenge(overrides: Partial<PasskeyChallenge> = {}) {
      challengeRepo.findOneBy.mockResolvedValue({
        challenge: 'auth-challenge',
        userId: null,
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
      });
    }

    it('signs the user in and bumps the signature counter', async () => {
      issueChallenge();

      const user = await service.verifyAuthentication(response as never);

      expect(user.id).toBe(42);
      expect(passkeyRepo.update).toHaveBeenCalledWith(7, expect.objectContaining({ counter: 4, backedUp: true }));
    });

    it('burns the challenge so an assertion cannot be replayed', async () => {
      issueChallenge();

      await service.verifyAuthentication(response as never);

      expect(challengeRepo.delete).toHaveBeenCalledWith({ challenge: 'auth-challenge' });
    });

    it('rejects an unknown challenge', async () => {
      challengeRepo.findOneBy.mockResolvedValue(null);

      await expect(service.verifyAuthentication(response as never)).rejects.toThrow(BadRequestException);
    });

    it('rejects an expired challenge', async () => {
      issueChallenge({ expiresAt: new Date(Date.now() - 1) });

      await expect(service.verifyAuthentication(response as never)).rejects.toThrow(BadRequestException);
    });

    it('rejects a registration challenge reused for sign-in', async () => {
      issueChallenge({ userId: 42 });

      await expect(service.verifyAuthentication(response as never)).rejects.toThrow(BadRequestException);
    });

    it('rejects a credential that is not registered', async () => {
      issueChallenge();
      passkeyRepo.findOneBy.mockResolvedValue(null);

      await expect(service.verifyAuthentication(response as never)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a signature that does not verify', async () => {
      issueChallenge();
      verifyAuthenticationResponse.mockResolvedValue({ verified: false, authenticationInfo: {} });

      await expect(service.verifyAuthentication(response as never)).rejects.toThrow(UnauthorizedException);
    });

    it('refuses a user whose email is not verified, so a passkey cannot skip re-verification', async () => {
      issueChallenge();
      userRepo.findOneBy.mockResolvedValue({ id: 42, username: 'maker', isEmailVerified: false } as User);

      await expect(service.verifyAuthentication(response as never)).rejects.toThrow(UserEmailNotVerifiedException);
    });
  });

  describe('sign-in audit', () => {
    const response = { id: 'cred-1', response: { clientDataJSON: clientDataFor('auth-challenge') } };
    const ip = '203.0.113.7';

    it('logs a throttled IP as rate limited and rethrows the throttle', async () => {
      const throttled = new Error('too many attempts');
      bruteForce.assertIpAllowed.mockRejectedValue(throttled);

      await expect(service.assertIpAllowed(ip)).rejects.toBe(throttled);

      expect(bruteForce.assertIpAllowed).toHaveBeenCalledWith('login', ip);
      expect(authAuditLog).toHaveBeenCalledTimes(1);
      expect(authAuditLog).toHaveBeenCalledWith({ type: 'login', outcome: 'rate_limited', ip, reason: 'ip_throttled' });
    });

    it('logs nothing for an IP that is not throttled', async () => {
      await service.assertIpAllowed(ip);

      expect(authAuditLog).not.toHaveBeenCalled();
    });

    it('counts and logs a rejected passkey as invalid credentials', async () => {
      const rejected = new UnauthorizedException('Passkey not recognized');
      jest.spyOn(service, 'verifyAuthentication').mockRejectedValue(rejected);

      await expect(service.signIn(response as never, 'https://make.example.com', ip)).rejects.toBe(rejected);

      expect(bruteForce.recordFailure).toHaveBeenCalledWith('login', ip, null);
      expect(bruteForce.recordSuccess).not.toHaveBeenCalled();
      expect(authAuditLog).toHaveBeenCalledTimes(1);
      expect(authAuditLog).toHaveBeenCalledWith({
        type: 'login',
        outcome: 'invalid_credentials',
        ip,
        reason: 'passkey_rejected',
      });
    });

    it('counts and logs a verified passkey as a successful login for its user', async () => {
      const user = { id: 42, username: 'maker', isEmailVerified: true } as User;
      jest.spyOn(service, 'verifyAuthentication').mockResolvedValue(user);

      await expect(service.signIn(response as never, 'https://make.example.com', ip)).resolves.toBe(user);

      expect(service.verifyAuthentication).toHaveBeenCalledWith(response, 'https://make.example.com');
      expect(bruteForce.recordSuccess).toHaveBeenCalledWith('login', ip, 42, 'maker');
      expect(bruteForce.recordFailure).not.toHaveBeenCalled();
      expect(authAuditLog).toHaveBeenCalledTimes(1);
      expect(authAuditLog).toHaveBeenCalledWith({
        type: 'login',
        outcome: 'success',
        ip,
        userId: 42,
        username: 'maker',
      });
    });
  });

  describe('delete', () => {
    it('only deletes passkeys owned by the user', async () => {
      await service.delete(42, 7, origin);

      expect(passkeyRepo.delete).toHaveBeenCalledWith({ id: 7, userId: 42 });
    });

    it('throws when the passkey belongs to somebody else', async () => {
      passkeyRepo.delete.mockResolvedValue({ affected: 0 });

      await expect(service.delete(1, 7, origin)).rejects.toThrow(NotFoundException);
    });
  });
});
