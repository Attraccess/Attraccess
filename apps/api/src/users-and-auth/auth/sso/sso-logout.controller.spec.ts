import { Request, Response } from 'express';
import { SsoLogoutController } from './sso-logout.controller';
import { SsoLogoutService } from './sso-logout.service';
import { CookieConfigService } from '../../../common/services/cookie-config.service';

describe('Provider logout notification HTTP behavior', () => {
  const service = {
    consumeResult: jest.fn(),
    frontchannel: jest.fn(),
    backchannel: jest.fn(),
    samlMessage: jest.fn(),
    oidcReturn: jest.fn(),
  };
  const cookies = { getCookieName: () => 'auth-session', clearAuthCookie: jest.fn() };
  const controller = new SsoLogoutController(
    service as unknown as SsoLogoutService,
    cookies as unknown as CookieConfigService,
  );
  const response = {
    setHeader: jest.fn(),
    removeHeader: jest.fn(),
    type: jest.fn(),
    send: jest.fn(),
    redirect: jest.fn(),
  };
  beforeEach(() => {
    jest.clearAllMocks();
    response.type.mockReturnValue(response);
  });

  it('consumes the supplied result once without caching its response', async () => {
    service.consumeResult.mockResolvedValue({ result: 'partial' });
    expect(await controller.consumeResult('receipt', response as unknown as Response)).toEqual({ result: 'partial' });
    expect(service.consumeResult).toHaveBeenCalledWith('receipt');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('allows the minimal iframe response and clears cookies only when their session was affected', async () => {
    service.frontchannel.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const request = { cookies: { 'auth-session': 'cookie' } } as Request;
    await controller.frontchannel(1, 'issuer', 'sid', request, response as unknown as Response);
    expect(cookies.clearAuthCookie).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Security-Policy', "default-src 'none'; frame-ancestors *");
    expect(response.removeHeader).toHaveBeenCalledWith('X-Frame-Options');
    await controller.frontchannel(1, 'issuer', 'sid', request, response as unknown as Response);
    expect(cookies.clearAuthCookie).toHaveBeenCalledTimes(1);
  });

  it('forwards back-channel tokens without requiring a user request or cookie', async () => {
    await controller.backchannel(1, 'signed-token', response as unknown as Response);
    expect(service.backchannel).toHaveBeenCalledWith(1, 'signed-token');
    expect(cookies.clearAuthCookie).not.toHaveBeenCalled();
  });

  it('preserves the original encoded Redirect query and rejects duplicate body parameters', async () => {
    service.samlMessage.mockResolvedValue('https://idp.example/slo');
    const original = 'SAMLRequest=abc%2B123&RelayState=state%20with%20spaces&SigAlg=algorithm&Signature=signature';
    await controller.samlGet(
      2,
      { SAMLRequest: 'abc+123', RelayState: 'state with spaces', SigAlg: 'algorithm', Signature: 'signature' },
      { originalUrl: '/api/auth/sso/SAML/2/slo?' + original } as Request,
      response as unknown as Response,
    );
    expect(service.samlMessage).toHaveBeenCalledWith(2, expect.any(Object), original);
    await expect(
      controller.samlPost(2, { SAMLRequest: ['first', 'second'] }, response as unknown as Response),
    ).rejects.toThrow('Invalid SAML');
  });
});
