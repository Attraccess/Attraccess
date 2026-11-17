import type { Response } from 'express';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { SettingsService } from '../../../settings/settings.service';
import { expectNoPrivateAccountFields, privateAccount } from '../private-account.test-fixture';
import { registerSsoControllerFixture } from './sso.controller.sso-controller.test-fixture';

describe('SSO login responses', () => {
  const fixture = registerSsoControllerFixture();

  function request(): AuthenticatedRequest {
    return {
      user: privateAccount(),
      headers: { 'user-agent': 'curl/8', accept: 'application/json' },
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
    } as unknown as AuthenticatedRequest;
  }

  const response = () => ({ cookie: jest.fn(), redirect: jest.fn() }) as unknown as Response;

  it('an OIDC callback without a redirect target returns only the public profile', async () => {
    const result = await fixture.controller.oidcLoginCallback(request(), undefined, response());

    expect(result).toMatchObject({ authToken: 'mock-session-token' });
    expectNoPrivateAccountFields(result);
  });

  it('a SAML callback with no redirect target and no app URL returns only the public profile', async () => {
    jest.mocked(fixture.module.get(SettingsService).getUrl).mockResolvedValue('');

    const result = await fixture.controller.samlLoginCallback(request(), '', '', '', response(), '2');

    expect(result).toMatchObject({ authToken: 'mock-session-token' });
    expectNoPrivateAccountFields(result);
  });
});
