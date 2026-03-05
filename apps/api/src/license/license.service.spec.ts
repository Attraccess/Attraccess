import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LicenseError, LicenseModuleType, LicenseService, LicenseUsageLimitType } from './license.service';
import { SettingsService } from '../settings/settings.service';

// Mock dynamic ESM import of @licenso/client used inside LicenseService
jest.mock('@licenso/client', () => ({
  verifyLicense: jest.fn(),
}));

import { verifyLicense } from '@licenso/client';
import { AppConfigType } from '../config/app.config';

describe('LicenseService', () => {
  let service: LicenseService;
  let configServiceGetMock: jest.Mock;
  let settingsServiceGetLicenseKeyMock: jest.Mock;
  let settingsServiceGetBackendUrlMock: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicenseService,
        {
          provide: ConfigService,
          useValue: {
            get: (configServiceGetMock = jest.fn()),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getLicenseKey: (settingsServiceGetLicenseKeyMock = jest.fn()),
            getUrl: (settingsServiceGetBackendUrlMock = jest.fn().mockResolvedValue(null)),
          },
        },
      ],
    }).compile();

    service = module.get<LicenseService>(LicenseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const NON_PROFIT_KEY =
    'I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md';

  const baseAppConfig = {
    LICENSO_PUBLIC_KEY: 'public-key',
  } as AppConfigType;

  it('throws LicenseError when app config is missing', async () => {
    configServiceGetMock.mockReturnValue(undefined);

    await expect(service.getLicenseData()).rejects.toThrow(LicenseError);
    await expect(service.getLicenseData()).rejects.toThrow('Application configuration not loaded');
  });

  it('returns non-profit full-access license data when LICENSE_KEY is the non-profit phrase', async () => {
    configServiceGetMock.mockReturnValue({ ...baseAppConfig });
    settingsServiceGetLicenseKeyMock.mockResolvedValue(NON_PROFIT_KEY);

    const data = await service.getLicenseData();

    expect(data.valid).toBe(true);
    expect(data.isNonProfit).toBe(true);
    expect(data.modules.sort()).toEqual(Object.values(LicenseModuleType).sort());
    // All usage limits should be Infinity
    Object.values(LicenseUsageLimitType).forEach((ul) => {
      expect(data.usageLimits[ul]).toBe(Infinity);
    });
  });

  it('returns mapped license data from licenso verifyLicense (standard flow)', async () => {
    (verifyLicense as jest.Mock).mockResolvedValue({
      valid: true,
      reason: undefined,
      payload: {
        cfg: {
          modules: { attractap: true, sso: false },
          usageLimits: { [LicenseUsageLimitType.RESOURCES]: 10 },
        },
      },
    });
    configServiceGetMock.mockReturnValue({ ...baseAppConfig });
    settingsServiceGetLicenseKeyMock.mockResolvedValue('standard-key');
    settingsServiceGetBackendUrlMock.mockResolvedValue('https://frontend.example');
    const data = await service.getLicenseData();

    expect(verifyLicense).toHaveBeenCalledWith('standard-key', 'public-key', 'frontend.example');
    expect(data.valid).toBe(true);
    expect(data.isNonProfit).toBe(false);
    expect(data.modules).toEqual([LicenseModuleType.ATTRACTAP]);
    expect(data.usageLimits[LicenseUsageLimitType.RESOURCES]).toBe(10);
    expect(data.usageLimits[LicenseUsageLimitType.USERS] ?? undefined).toBeUndefined();
  });

  it('uses app URL for licenso device id', async () => {
    (verifyLicense as jest.Mock).mockResolvedValue({
      valid: true,
      reason: undefined,
      payload: {
        cfg: {
          modules: { attractap: true },
          usageLimits: {},
        },
      },
    });
    configServiceGetMock.mockReturnValue({ ...baseAppConfig });
    settingsServiceGetLicenseKeyMock.mockResolvedValue('standard-key');
    settingsServiceGetBackendUrlMock.mockResolvedValue('https://api.mycompany.com');

    const data = await service.getLicenseData();

    expect(verifyLicense).toHaveBeenCalledWith('standard-key', 'public-key', 'api.mycompany.com');
    expect(data.valid).toBe(true);
  });

  it('verifyLicense throws when license is invalid', async () => {
    (verifyLicense as jest.Mock).mockResolvedValue({
      valid: false,
      reason: 'EXPIRED',
      payload: { cfg: { modules: {}, usageLimits: {} } },
    });
    configServiceGetMock.mockReturnValue({ ...baseAppConfig });
    settingsServiceGetLicenseKeyMock.mockResolvedValue('standard-key');
    settingsServiceGetBackendUrlMock.mockResolvedValue('https://frontend.example');

    await expect(service.verifyLicense()).rejects.toThrow(LicenseError);
    await expect(service.verifyLicense()).rejects.toThrow('EXPIRED');
  });

  it('verifyLicense returns data when requirements are not provided', async () => {
    (verifyLicense as jest.Mock).mockResolvedValue({
      valid: true,
      reason: undefined,
      payload: { cfg: { modules: { attractap: true }, usageLimits: {} } },
    });
    configServiceGetMock.mockReturnValue({ ...baseAppConfig });
    settingsServiceGetLicenseKeyMock.mockResolvedValue('standard-key');
    settingsServiceGetBackendUrlMock.mockResolvedValue('https://frontend.example');

    const data = await service.verifyLicense();
    expect(data.valid).toBe(true);
  });

  it('verifyLicense throws when required module is missing from license', async () => {
    (verifyLicense as jest.Mock).mockResolvedValue({
      valid: true,
      reason: undefined,
      payload: { cfg: { modules: { attractap: true, sso: false }, usageLimits: {} } },
    });
    configServiceGetMock.mockReturnValue({ ...baseAppConfig });
    settingsServiceGetLicenseKeyMock.mockResolvedValue('standard-key');
    settingsServiceGetBackendUrlMock.mockResolvedValue('https://frontend.example');

    await expect(service.verifyLicense({ modules: [LicenseModuleType.SSO] })).rejects.toThrow(
      'Trying to use module(s) that are not included in the license: sso'
    );
  });

  it('verifyLicense allows when usage is below the limit', async () => {
    (verifyLicense as jest.Mock).mockResolvedValue({
      valid: true,
      reason: undefined,
      payload: {
        cfg: {
          modules: { attractap: true },
          usageLimits: { [LicenseUsageLimitType.RESOURCES]: 5 },
        },
      },
    });
    configServiceGetMock.mockReturnValue({ ...baseAppConfig });
    settingsServiceGetLicenseKeyMock.mockResolvedValue('standard-key');
    settingsServiceGetBackendUrlMock.mockResolvedValue('https://frontend.example');

    const data = await service.verifyLicense({
      usageLimits: { [LicenseUsageLimitType.RESOURCES]: 4 },
    });
    expect(data.valid).toBe(true);
  });

  it('verifyLicense throws when usage reaches the limit', async () => {
    (verifyLicense as jest.Mock).mockResolvedValue({
      valid: true,
      reason: undefined,
      payload: {
        cfg: {
          modules: { attractap: true },
          usageLimits: { [LicenseUsageLimitType.USERS]: 10 },
        },
      },
    });
    configServiceGetMock.mockReturnValue({ ...baseAppConfig });
    settingsServiceGetLicenseKeyMock.mockResolvedValue('standard-key');
    settingsServiceGetBackendUrlMock.mockResolvedValue('https://frontend.example');

    await expect(service.verifyLicense({ usageLimits: { [LicenseUsageLimitType.USERS]: 10 } })).rejects.toThrow(
      'Trying to use more than the allowed amount of users'
    );
  });

  it('verifyLicense does not crash when usageLimits in requirements is undefined', async () => {
    (verifyLicense as jest.Mock).mockResolvedValue({
      valid: true,
      reason: undefined,
      payload: { cfg: { modules: { attractap: true }, usageLimits: {} } },
    });
    configServiceGetMock.mockReturnValue({ ...baseAppConfig });
    settingsServiceGetLicenseKeyMock.mockResolvedValue('standard-key');
    settingsServiceGetBackendUrlMock.mockResolvedValue('https://frontend.example');

    await expect(service.verifyLicense({ modules: [LicenseModuleType.ATTRACTAP] })).resolves.toMatchObject({
      valid: true,
    });
  });
});
