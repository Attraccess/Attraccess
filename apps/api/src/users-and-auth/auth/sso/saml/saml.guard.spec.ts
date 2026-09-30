import { Test } from '@nestjs/testing';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { ForbiddenException, Logger } from '@nestjs/common';
import { SSOProviderType } from '@attraccess/database-entities';
import { SSOSamlGuard } from './saml.guard';
import { SSOService } from '../sso.service';
import { SettingsService } from '../../../../settings/settings.service';
import { LicenseService, LicenseModuleType } from '../../../../license/license.service';
import { MetricsService } from '../../../../metrics/metrics.service';
import {
  InvalidSSOProviderIdException,
  InvalidSSOProviderTypeException,
  SSOProviderNotFoundException,
} from '../errors';

describe('SAML request preparation', () => {
  const sso = { getProviderByTypeAndIdWithConfiguration: jest.fn() };
  const settings = { getUrl: jest.fn() };
  const license = { verifyLicense: jest.fn() };
  const inc = jest.fn();
  let guard: SSOSamlGuard;
  const configuration = { entryPoint: 'https://idp.example/saml' };
  beforeEach(async () => {
    jest.resetAllMocks();
    settings.getUrl.mockResolvedValue('https://access.example');
    sso.getProviderByTypeAndIdWithConfiguration.mockResolvedValue({ samlConfiguration: configuration });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const module = await Test.createTestingModule({
      providers: [
        SSOSamlGuard,
        { provide: SSOService, useValue: sso },
        { provide: SettingsService, useValue: settings },
        { provide: LicenseService, useValue: license },
        { provide: MetricsService, useValue: { authSsoLoginFailuresTotal: { inc } } },
      ],
    }).compile();
    guard = module.get(SSOSamlGuard);
  });
  afterEach(() => jest.restoreAllMocks());
  const request = (url = `/api/auth/sso/${SSOProviderType.SAML}/7/login`) => ({ url, query: {} });
  const context = (req: object) => new ExecutionContextHost([req, {}]);

  it('pins provider-specific options and relay state to this request', async () => {
    const req = request(`/api/auth/sso/${SSOProviderType.SAML}/7/login?redirectTo=%2Fresources`);
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(license.verifyLicense).toHaveBeenCalledWith({ modules: [LicenseModuleType.SSO] });
    expect(sso.getProviderByTypeAndIdWithConfiguration).toHaveBeenCalledWith(SSOProviderType.SAML, 7);
    expect(req).toMatchObject({
      query: { RelayState: 'https://access.example/resources' },
      ssoSamlOptions: {
        providerId: 7,
        samlConfiguration: configuration,
        callbackUrl: `https://access.example/api/auth/sso/${SSOProviderType.SAML}/7/callback`,
      },
    });
    expect(inc).not.toHaveBeenCalled();
  });
  it('uses the application URL as the default relay state', async () => {
    const req = request();
    await guard.canActivate(context(req));
    expect(req.query).toEqual({ RelayState: 'https://access.example' });
  });
  it('rejects an unlicensed request before resolving provider configuration', async () => {
    license.verifyLicense.mockRejectedValue(new Error('expired'));
    await expect(guard.canActivate(context(request()))).rejects.toBeInstanceOf(ForbiddenException);
    expect(sso.getProviderByTypeAndIdWithConfiguration).not.toHaveBeenCalled();
    expect(inc).toHaveBeenCalledWith({ provider_type: 'saml', reason: 'guard_rejected' });
  });
  it('fails closed when no application URL is configured', async () => {
    settings.getUrl.mockResolvedValue(null);
    await expect(guard.canActivate(context(request()))).resolves.toBe(false);
    expect(inc).toHaveBeenCalled();
  });
  it.each([
    [`/api/auth/sso/${SSOProviderType.SAML}/invalid/login`, InvalidSSOProviderIdException],
    ['/api/auth/sso/invalid/7/login', InvalidSSOProviderTypeException],
  ])('rejects malformed routes %s', async (url, error) => {
    await expect(guard.canActivate(context(request(url)))).rejects.toBeInstanceOf(error);
    expect(inc).toHaveBeenCalledTimes(1);
  });
  it.each([null, {}])('rejects unavailable SAML configuration %p', async (provider) => {
    sso.getProviderByTypeAndIdWithConfiguration.mockResolvedValue(provider);
    await expect(guard.canActivate(context(request()))).rejects.toBeInstanceOf(SSOProviderNotFoundException);
  });
});
