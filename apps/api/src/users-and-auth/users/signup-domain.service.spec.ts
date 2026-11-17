import type { SettingsRows } from '../../settings/settings-rows.port';
import { ForbiddenSignupDomainException } from './errors/forbiddenSignupDomain.exception';
import { SignupDomainService } from './signup-domain.service';

describe('SignupDomainService', () => {
  let service: SignupDomainService;
  let settings: jest.Mocked<Pick<SettingsRows, 'findValue' | 'upsertValue'>>;

  beforeEach(() => {
    settings = { findValue: jest.fn(), upsertValue: jest.fn() };
    service = new SignupDomainService(settings as unknown as SettingsRows);
  });

  it('getWhitelist should return default "*" when missing', async () => {
    settings.findValue.mockResolvedValue(null);
    const result = await service.getWhitelist();
    expect(result).toEqual(['*']);
  });

  it('getWhitelist should parse and normalize domains', async () => {
    settings.findValue.mockResolvedValue(' Example.COM ,allowed.org,  ,Another.Net ');
    const result = await service.getWhitelist();
    expect(result).toEqual(['example.com', 'allowed.org', 'another.net']);
    expect(settings.findValue).toHaveBeenCalledWith('auth', 'local_signup_domain_whitelist');
  });

  it('setWhitelist should store the joined list', async () => {
    await service.setWhitelist(['example.com', 'allowed.org']);
    expect(settings.upsertValue).toHaveBeenCalledWith(
      'auth',
      'local_signup_domain_whitelist',
      'example.com,allowed.org',
    );
  });

  it('isLocalSignupEnabled should return false when list is empty', async () => {
    settings.findValue.mockResolvedValue('');
    const result = await service.isLocalSignupEnabled();
    expect(result).toBe(false);
  });

  it('isLocalSignupEnabled should return true when list has any value', async () => {
    settings.findValue.mockResolvedValue('*');
    const result = await service.isLocalSignupEnabled();
    expect(result).toBe(true);
  });

  it('assertEmailDomainAllowed accepts listed domains and rejects others', async () => {
    settings.findValue.mockResolvedValue('example.com');
    await expect(service.assertEmailDomainAllowed('a@Example.com')).resolves.toBeUndefined();
    await expect(service.assertEmailDomainAllowed('a@other.org')).rejects.toBeInstanceOf(
      ForbiddenSignupDomainException,
    );
  });
});
