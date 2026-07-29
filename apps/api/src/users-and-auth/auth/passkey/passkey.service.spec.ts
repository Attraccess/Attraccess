import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Passkey, PasskeyChallenge, User } from '@attraccess/database-entities';
import { PasskeyService } from './passkey.service';
import { SettingsService } from '../../../settings/settings.service';

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
  let passkeyRepo: Record<string, jest.Mock>;
  let challengeRepo: Record<string, jest.Mock>;
  let userRepo: Record<string, jest.Mock>;
  let getUrl: jest.Mock;

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
    userRepo = { findOneBy: jest.fn().mockResolvedValue({ id: 42, username: 'maker' } as User) };
    getUrl = jest.fn().mockResolvedValue('https://make.example.com');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
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
  });

  describe('delete', () => {
    it('only deletes passkeys owned by the user', async () => {
      await service.delete(42, 7);

      expect(passkeyRepo.delete).toHaveBeenCalledWith({ id: 7, userId: 42 });
    });

    it('throws when the passkey belongs to somebody else', async () => {
      passkeyRepo.delete.mockResolvedValue({ affected: 0 });

      await expect(service.delete(1, 7)).rejects.toThrow(NotFoundException);
    });
  });
});
