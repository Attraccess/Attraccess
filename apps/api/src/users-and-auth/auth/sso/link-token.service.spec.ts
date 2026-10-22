import { SsoLinkSecretPersistence, StoredLinkSecret } from '../persistence/port';
import { UnauthorizedException } from '@nestjs/common';
import { SSOProviderType } from '@attraccess/application-models';
import { SSOLinkTokenService } from './link-token.service';
import { EncryptionService } from '../../../encryption/encryption.service';

describe('SSOLinkTokenService', () => {
  const basePayload = {
    email: 'user@example.com',
    providerId: 1,
    providerType: SSOProviderType.OIDC,
    ssoSubject: 'sub-1',
  };
  const fixedNow = 1_700_000_000_000;

  let persistence: jest.Mocked<SsoLinkSecretPersistence>;
  let encryptionService: Pick<EncryptionService, 'isEncrypted' | 'encrypt' | 'decryptIfEncrypted'>;

  beforeEach(() => {
    persistence = { readSecret: jest.fn(), insertSecret: jest.fn(), updateSecret: jest.fn() };
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
    persistence.readSecret.mockResolvedValue(null);
    persistence.insertSecret.mockResolvedValue(undefined);

    const service = new SSOLinkTokenService(persistence, encryptionService as EncryptionService);

    const token = await service.issue(basePayload);

    expect(persistence.insertSecret).toHaveBeenCalledWith(expect.any(String));

    const payload = await service.verify(token);
    expect(payload.email).toBe(basePayload.email);
    expect(payload.providerId).toBe(basePayload.providerId);
  });

  it('reuses existing secret without inserting a new one', async () => {
    persistence.readSecret.mockResolvedValue({ value: 'existing-secret' } as StoredLinkSecret);

    const service = new SSOLinkTokenService(persistence, encryptionService as EncryptionService);

    const token = await service.issue(basePayload);

    expect(persistence.insertSecret).not.toHaveBeenCalled();
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

    persistence.readSecret
      .mockResolvedValueOnce({ value: 'old-secret' } as StoredLinkSecret) // initial fetch
      .mockResolvedValueOnce({ value: 'rotated-secret' } as StoredLinkSecret); // refresh fetch

    const service = new SSOLinkTokenService(persistence, encryptionService as EncryptionService);

    await service.issue(basePayload); // warm cache with old-secret
    await service.issue(basePayload); // should refresh and use rotated-secret

    expect(persistence.readSecret).toHaveBeenCalledTimes(2);
    const cachedSecret = Reflect.get(service as object, 'cachedSecret') as string | null;
    expect(cachedSecret).toBe('rotated-secret');
  });

  it('recovers when insert races and secret appears afterwards', async () => {
    persistence.readSecret
      .mockResolvedValueOnce(null) // initial fetch
      .mockResolvedValueOnce({ value: 'post-race-secret' } as StoredLinkSecret); // after insert failure
    persistence.insertSecret.mockRejectedValue(new Error('duplicate'));

    const service = new SSOLinkTokenService(persistence, encryptionService as EncryptionService);

    const token = await service.issue(basePayload);

    expect(persistence.insertSecret).toHaveBeenCalled();
    expect(persistence.readSecret).toHaveBeenCalledTimes(2);
    await expect(service.verify(token)).resolves.toMatchObject({ providerId: basePayload.providerId });
  });

  it('throws when secret cannot be created or retrieved', async () => {
    persistence.readSecret.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    persistence.insertSecret.mockRejectedValue(new Error('write failure'));

    const service = new SSOLinkTokenService(persistence, encryptionService as EncryptionService);

    await expect(service.issue(basePayload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects expired tokens', async () => {
    persistence.readSecret.mockResolvedValue({ value: 'expire-secret' } as StoredLinkSecret);
    const service = new SSOLinkTokenService(persistence, encryptionService as EncryptionService);

    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReset();
    nowSpy.mockReturnValueOnce(fixedNow); // issue timestamp
    nowSpy.mockReturnValueOnce(fixedNow); // secret fetch during issue
    nowSpy.mockImplementation(() => fixedNow + 2000); // verification path

    const token = await service.issue(basePayload, 1000); // 1 second TTL

    await expect(service.verify(token)).rejects.toThrow(UnauthorizedException);
  });
});
