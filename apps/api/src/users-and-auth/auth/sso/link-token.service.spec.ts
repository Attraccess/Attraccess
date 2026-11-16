import { UnauthorizedException } from '@nestjs/common';
import { InsertResult, Repository } from 'typeorm';
import { SSOProviderType, Setting } from '@attraccess/database-entities';
import { MAX_LINK_TOKEN_PASSWORD_ATTEMPTS, SSOLinkTokenService } from './link-token.service';
import { SessionStore } from '../session-store/session-store';
import { EncryptionService } from '../../../encryption/encryption.service';

describe('SSOLinkTokenService', () => {
  const basePayload = {
    email: 'user@example.com',
    providerId: 1,
    providerType: SSOProviderType.OIDC,
    ssoSubject: 'sub-1',
  };
  const fixedNow = 1_700_000_000_000;

  let repository: jest.Mocked<Pick<Repository<Setting>, 'findOneBy' | 'insert' | 'update'>>;
  let encryptionService: Pick<EncryptionService, 'isEncrypted' | 'encrypt' | 'decryptIfEncrypted'>;

  let sessionStore: jest.Mocked<
    Pick<SessionStore, 'getEphemeralState' | 'putEphemeralState' | 'incrementEphemeralCounter'>
  >;

  beforeEach(() => {
    sessionStore = {
      getEphemeralState: jest.fn().mockResolvedValue(null),
      putEphemeralState: jest.fn().mockResolvedValue(true),
      incrementEphemeralCounter: jest.fn().mockResolvedValue(1),
    };
    repository = {
      findOneBy: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };
    const isEncrypted = (value: string | null | undefined): value is string =>
      typeof value === 'string' && value.startsWith('enc:');

    encryptionService = {
      isEncrypted,
      encrypt: jest.fn((value: string) => `enc:${value}`),
      decryptIfEncrypted: jest.fn((value: string) => (value.startsWith('enc:') ? value.replace(/^enc:/, '') : value)),
    };

    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a new secret when missing and issues/verifies tokens', async () => {
    repository.findOneBy.mockResolvedValue(null);
    repository.insert.mockResolvedValue({ identifiers: [], generatedMaps: [], raw: [] } as InsertResult);

    const service = new SSOLinkTokenService(
      repository as unknown as Repository<Setting>,
      encryptionService as EncryptionService,
      sessionStore as unknown as SessionStore,
    );

    const token = await service.issue(basePayload);

    expect(repository.insert).toHaveBeenCalledWith({
      parent: 'auth',
      key: 'sso_link_token_secret',
      value: expect.any(String),
    });

    const payload = await service.verify(token);
    expect(payload.email).toBe(basePayload.email);
    expect(payload.providerId).toBe(basePayload.providerId);
  });

  it('reuses existing secret without inserting a new one', async () => {
    repository.findOneBy.mockResolvedValue({ value: 'existing-secret' } as Setting);

    const service = new SSOLinkTokenService(
      repository as unknown as Repository<Setting>,
      encryptionService as EncryptionService,
      sessionStore as unknown as SessionStore,
    );

    const token = await service.issue(basePayload);

    expect(repository.insert).not.toHaveBeenCalled();
    await expect(service.verify(token)).resolves.toMatchObject({
      email: basePayload.email,
    });
  });

  it('refreshes cached secret after the refresh window to pick up rotation', async () => {
    const t0 = fixedNow;
    const t1 = t0 + 5 * 60 * 1000 + 1; // just beyond refresh window

    const dateSpy = jest.spyOn(Date, 'now');
    dateSpy
      .mockReturnValueOnce(t0) // issue: iat
      .mockReturnValueOnce(t0) // getSecret: check refresh
      .mockReturnValueOnce(t1) // second issue: iat
      .mockReturnValueOnce(t1); // getSecret: force refresh

    repository.findOneBy
      .mockResolvedValueOnce({ value: 'old-secret' } as Setting) // initial fetch
      .mockResolvedValueOnce({ value: 'rotated-secret' } as Setting); // refresh fetch

    const service = new SSOLinkTokenService(
      repository as unknown as Repository<Setting>,
      encryptionService as EncryptionService,
      sessionStore as unknown as SessionStore,
    );

    await service.issue(basePayload); // warm cache with old-secret
    await service.issue(basePayload); // should refresh and use rotated-secret

    expect(repository.findOneBy).toHaveBeenCalledTimes(2);
    const cachedSecret = Reflect.get(service as object, 'cachedSecret') as string | null;
    expect(cachedSecret).toBe('rotated-secret');
  });

  it('recovers when insert races and secret appears afterwards', async () => {
    repository.findOneBy
      .mockResolvedValueOnce(null) // initial fetch
      .mockResolvedValueOnce({ value: 'post-race-secret' } as Setting); // after insert failure
    repository.insert.mockRejectedValue(new Error('duplicate'));

    const service = new SSOLinkTokenService(
      repository as unknown as Repository<Setting>,
      encryptionService as EncryptionService,
      sessionStore as unknown as SessionStore,
    );

    const token = await service.issue(basePayload);

    expect(repository.insert).toHaveBeenCalled();
    expect(repository.findOneBy).toHaveBeenCalledTimes(2);
    await expect(service.verify(token)).resolves.toMatchObject({ providerId: basePayload.providerId });
  });

  it('throws when secret cannot be created or retrieved', async () => {
    repository.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    repository.insert.mockRejectedValue(new Error('write failure'));

    const service = new SSOLinkTokenService(
      repository as unknown as Repository<Setting>,
      encryptionService as EncryptionService,
      sessionStore as unknown as SessionStore,
    );

    await expect(service.issue(basePayload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects expired tokens', async () => {
    repository.findOneBy.mockResolvedValue({ value: 'expire-secret' } as Setting);
    const service = new SSOLinkTokenService(
      repository as unknown as Repository<Setting>,
      encryptionService as EncryptionService,
      sessionStore as unknown as SessionStore,
    );

    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReset();
    nowSpy.mockReturnValueOnce(fixedNow); // issue timestamp
    nowSpy.mockReturnValueOnce(fixedNow); // secret fetch during issue
    nowSpy.mockImplementation(() => fixedNow + 2000); // verification path

    const token = await service.issue(basePayload, 1000); // 1 second TTL

    await expect(service.verify(token)).rejects.toThrow(UnauthorizedException);
  });

  describe('single-use state', () => {
    async function issued() {
      repository.findOneBy.mockResolvedValue({ value: 'secret' } as Setting);
      const service = new SSOLinkTokenService(
        repository as unknown as Repository<Setting>,
        encryptionService as EncryptionService,
        sessionStore as unknown as SessionStore,
      );
      const token = await service.issue(basePayload);
      return { service, token, payload: await service.verify(token) };
    }

    it('issues a random token id of at least 128 bits', async () => {
      const first = await issued();
      const second = await issued();

      expect(Buffer.from(first.payload.jti, 'base64url')).toHaveLength(16);
      expect(first.payload.jti).not.toBe(second.payload.jti);
    });

    it('rejects a validly signed token without a token id', async () => {
      const { service } = await issued();
      const sign = Reflect.get(service as object, 'sign').bind(service) as (payload: string) => Promise<string>;
      const encoded = Buffer.from(JSON.stringify({ ...basePayload, iat: fixedNow, exp: fixedNow + 1000 })).toString(
        'base64url',
      );

      await expect(service.verify(`${encoded}.${await sign(encoded)}`)).rejects.toThrow('INVALID_LINK_TOKEN');
    });

    it('accepts a fresh token', async () => {
      const { service, payload } = await issued();

      await expect(service.assertUsable(payload)).resolves.toBeUndefined();
    });

    it('rejects a used token', async () => {
      const { service, payload } = await issued();
      sessionStore.getEphemeralState.mockImplementation(async (key) =>
        key === `sso-link-used:${payload.jti}` ? '1' : null,
      );

      await expect(service.assertUsable(payload)).rejects.toThrow('LINK_TOKEN_USED');
    });

    it('rejects an exhausted token even before reading the password', async () => {
      const { service, payload } = await issued();
      sessionStore.getEphemeralState.mockImplementation(async (key) =>
        key === `sso-link-failures:${payload.jti}` ? String(MAX_LINK_TOKEN_PASSWORD_ATTEMPTS) : null,
      );

      await expect(service.assertUsable(payload)).rejects.toThrow('LINK_TOKEN_EXHAUSTED');
    });

    it('still accepts a token below the failure limit', async () => {
      const { service, payload } = await issued();
      sessionStore.getEphemeralState.mockImplementation(async (key) =>
        key === `sso-link-failures:${payload.jti}` ? String(MAX_LINK_TOKEN_PASSWORD_ATTEMPTS - 1) : null,
      );

      await expect(service.assertUsable(payload)).resolves.toBeUndefined();
    });

    it('claims password attempts atomically until the token expires', async () => {
      const { service, payload } = await issued();
      sessionStore.incrementEphemeralCounter.mockResolvedValue(MAX_LINK_TOKEN_PASSWORD_ATTEMPTS);

      await expect(service.reservePasswordAttempt(payload)).resolves.toBeUndefined();

      expect(sessionStore.incrementEphemeralCounter).toHaveBeenCalledWith(
        `sso-link-failures:${payload.jti}`,
        payload.exp,
      );
    });

    it('refuses an attempt beyond the limit, e.g. one that lost a race on another instance', async () => {
      const { service, payload } = await issued();
      sessionStore.incrementEphemeralCounter.mockResolvedValue(MAX_LINK_TOKEN_PASSWORD_ATTEMPTS + 1);

      await expect(service.reservePasswordAttempt(payload)).rejects.toThrow('LINK_TOKEN_EXHAUSTED');
    });

    it('reports a token that expired while the request waited as expired, not used', async () => {
      const { service, payload } = await issued();
      const expired = { ...payload, exp: Date.now() - 1 };

      await expect(service.assertUsable(expired)).rejects.toThrow('LINK_TOKEN_EXPIRED');
      await expect(service.reservePasswordAttempt(expired)).rejects.toThrow('LINK_TOKEN_EXPIRED');
      await expect(service.consume(expired)).rejects.toThrow('LINK_TOKEN_EXPIRED');
      expect(sessionStore.incrementEphemeralCounter).not.toHaveBeenCalled();
      expect(sessionStore.putEphemeralState).not.toHaveBeenCalled();
    });

    it('consumes insert-if-absent until the token expires and rejects a second use', async () => {
      const { service, payload } = await issued();

      await expect(service.consume(payload)).resolves.toBeUndefined();
      expect(sessionStore.putEphemeralState).toHaveBeenCalledWith(`sso-link-used:${payload.jti}`, '1', payload.exp);

      sessionStore.putEphemeralState.mockResolvedValue(false);
      await expect(service.consume(payload)).rejects.toThrow('LINK_TOKEN_USED');
    });
  });
});
