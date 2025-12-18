import { UnauthorizedException } from '@nestjs/common';
import { InsertResult, Repository } from 'typeorm';
import { SSOProviderType, Setting } from '@attraccess/database-entities';
import { SSOLinkTokenService } from './link-token.service';

describe('SSOLinkTokenService', () => {
  const basePayload = {
    email: 'user@example.com',
    providerId: 1,
    providerType: SSOProviderType.OIDC,
    ssoSubject: 'sub-1',
  };
  const fixedNow = 1_700_000_000_000;

  let repository: jest.Mocked<Pick<Repository<Setting>, 'findOneBy' | 'insert'>>;

  beforeEach(() => {
    repository = {
      findOneBy: jest.fn(),
      insert: jest.fn(),
    };

    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a new secret when missing and issues/verifies tokens', async () => {
    repository.findOneBy.mockResolvedValue(null);
    repository.insert.mockResolvedValue({ identifiers: [], generatedMaps: [], raw: [] } as InsertResult);

    const service = new SSOLinkTokenService(repository as unknown as Repository<Setting>);

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

    const service = new SSOLinkTokenService(repository as unknown as Repository<Setting>);

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

    const service = new SSOLinkTokenService(repository as unknown as Repository<Setting>);

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

    const service = new SSOLinkTokenService(repository as unknown as Repository<Setting>);

    const token = await service.issue(basePayload);

    expect(repository.insert).toHaveBeenCalled();
    expect(repository.findOneBy).toHaveBeenCalledTimes(2);
    await expect(service.verify(token)).resolves.toMatchObject({ providerId: basePayload.providerId });
  });

  it('throws when secret cannot be created or retrieved', async () => {
    repository.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    repository.insert.mockRejectedValue(new Error('write failure'));

    const service = new SSOLinkTokenService(repository as unknown as Repository<Setting>);

    await expect(service.issue(basePayload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects expired tokens', async () => {
    repository.findOneBy.mockResolvedValue({ value: 'expire-secret' } as Setting);
    const service = new SSOLinkTokenService(repository as unknown as Repository<Setting>);

    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReset();
    nowSpy.mockReturnValueOnce(fixedNow); // issue timestamp
    nowSpy.mockReturnValueOnce(fixedNow); // secret fetch during issue
    nowSpy.mockImplementation(() => fixedNow + 2000); // verification path

    const token = await service.issue(basePayload, 1000); // 1 second TTL

    await expect(service.verify(token)).rejects.toThrow(UnauthorizedException);
  });
});
