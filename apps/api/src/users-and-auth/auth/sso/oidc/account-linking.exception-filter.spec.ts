import { ArgumentsHost } from '@nestjs/common';
import { SSOProviderType } from '@attraccess/database-entities';
import { AccountLinkingExceptionFilter } from './account-linking.exception-filter';
import { AccountLinkingRequiredException } from './exceptions/account-linking-required.exception';
import { SSOLinkTokenService } from '../link-token.service';
import { MetricsService } from '../../../../metrics/metrics.service';
import { SettingsService } from '../../../../settings/settings.service';
import { ApprovedOriginsService } from '../../../../common/security/approved-origins.service';

describe('AccountLinkingExceptionFilter', () => {
  const exception = (providerType: SSOProviderType) =>
    new AccountLinkingRequiredException({
      email: 'user@example.com',
      externalId: 'name-id',
      providerId: 2,
      providerType,
    });

  function setup(request: Record<string, unknown>, approved: string[] = ['https://app.example']) {
    const settings = { getUrl: jest.fn().mockResolvedValue('https://app.example/home') };
    const response = { redirect: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ query: {}, ...request }) }),
    } as unknown as ArgumentsHost;
    const linkTokens = { issue: jest.fn().mockResolvedValue('signed-token') };
    const filter = new AccountLinkingExceptionFilter(
      linkTokens as unknown as SSOLinkTokenService,
      { authSsoLoginFailuresTotal: { inc: jest.fn() } } as unknown as MetricsService,
      { isApproved: jest.fn(async (origin: string) => approved.includes(origin)) } as unknown as ApprovedOriginsService,
      settings as unknown as SettingsService,
    );
    return { filter, host, response, linkTokens };
  }

  it('redirects a SAML callback to the approved RelayState address with the link token', async () => {
    const { filter, host, response, linkTokens } = setup({ body: { RelayState: 'https://app.example/?foo=bar' } });
    await filter.catch(exception(SSOProviderType.SAML), host);
    expect(linkTokens.issue).toHaveBeenCalledWith({
      email: 'user@example.com',
      providerId: 2,
      providerType: SSOProviderType.SAML,
      ssoSubject: 'name-id',
    });
    const target = new URL(response.redirect.mock.calls[0][0]);
    expect(target.origin).toBe('https://app.example');
    expect(target.searchParams.get('accountLinking')).toBe('required');
    expect(target.searchParams.get('ssoLinkToken')).toBe('signed-token');
    expect(target.searchParams.has('foo')).toBe(false);
  });

  it('sends a SAML callback without RelayState to the configured application URL', async () => {
    const { filter, host, response } = setup({ body: { SAMLResponse: 'x' } });
    await filter.catch(exception(SSOProviderType.SAML), host);
    const target = new URL(response.redirect.mock.calls[0][0]);
    expect(target.origin + target.pathname).toBe('https://app.example/home');
    expect(target.searchParams.get('accountLinking')).toBe('required');
  });

  it.each(['https://evil.example/', 'not a url'])(
    'never redirects to the unapproved or malformed RelayState %p',
    async (relayState) => {
      const { filter, host, response } = setup({ body: { RelayState: relayState } });
      await filter.catch(exception(SSOProviderType.SAML), host);
      expect(new URL(response.redirect.mock.calls[0][0]).origin).toBe('https://app.example');
    },
  );

  it('checks a SAML redirectTo query like RelayState and prefers it when approved', async () => {
    const evil = setup({
      query: { redirectTo: 'https://evil.example/' },
      body: { RelayState: 'https://app.example/x' },
    });
    await evil.filter.catch(exception(SSOProviderType.SAML), evil.host);
    expect(evil.response.redirect.mock.calls[0][0]).toMatch(/^https:\/\/app\.example\/x\?/);
    const approved = setup({ query: { redirectTo: 'https://app.example/y' } });
    await approved.filter.catch(exception(SSOProviderType.SAML), approved.host);
    expect(approved.response.redirect.mock.calls[0][0]).toMatch(/^https:\/\/app\.example\/y\?/);
  });

  it('ignores RelayState for OIDC and answers with JSON when there is no redirect target', async () => {
    const oidc = setup({ body: { RelayState: 'https://app.example/' } });
    await oidc.filter.catch(exception(SSOProviderType.OIDC), oidc.host);
    expect(oidc.response.redirect).not.toHaveBeenCalled();
    expect(oidc.response.status).toHaveBeenCalledWith(400);
    expect(oidc.response.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'AccountLinkingRequired' }));
  });

  it('keeps redirecting to the redirectTo query when present', async () => {
    const { filter, host, response } = setup({ query: { redirectTo: 'https://app.example/' } });
    await filter.catch(exception(SSOProviderType.OIDC), host);
    expect(response.redirect).toHaveBeenCalledTimes(1);
  });
});
