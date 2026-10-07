import { SessionService } from '../session.service';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import type { Response } from 'express';
import { SSO_OIDC_REDIRECT_FROM_STATE_REQUEST_KEY } from './oidc/oidc-cookie-state-store';
import { registerSsoControllerFixture } from './sso.controller.sso-controller.test-fixture';
export function registerOidcLoginCallbackCases(fixture: ReturnType<typeof registerSsoControllerFixture>) {
  describe('oidcLoginCallback', () => {
    let mockRequest: {
      user: { id: number; username: string; email: string };
      headers: Record<string, string>;
      ip: string;
      connection: { remoteAddress: string };
    } & Record<string, unknown>;
    let mockResponse: { cookie: jest.Mock; redirect: jest.Mock };
    let sessionService: SessionService;

    beforeEach(() => {
      sessionService = fixture.module.get<SessionService>(SessionService);

      mockRequest = {
        user: { id: 1, username: 'testuser', email: 'test@example.com' },
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        ip: '127.0.0.1',
        connection: { remoteAddress: '127.0.0.1' },
      };

      mockResponse = {
        cookie: jest.fn(),
        redirect: jest.fn(),
      };
    });

    it('should set cookie and return user data for web browser requests', async () => {
      const result = await fixture.controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        undefined,
        mockResponse as unknown as Response,
      );

      expect(sessionService.createSession).toHaveBeenCalledWith(mockRequest.user, {
        userAgent: mockRequest.headers['user-agent'],
        ipAddress: mockRequest.ip,
      });

      expect(fixture.cookieConfigService.setAuthCookie).toHaveBeenCalledWith(mockResponse, 'mock-session-token');

      expect(result).toEqual({
        user: mockRequest.user,
        authToken: 'mock-session-token',
      });
    });

    it('should return session token for programmatic requests', async () => {
      // Modify request to look programmatic
      mockRequest.headers.accept = 'application/json';
      mockRequest.headers['user-agent'] = 'curl/7.68.0';

      const result = await fixture.controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        undefined,
        mockResponse as unknown as Response,
      );

      expect(sessionService.createSession).toHaveBeenCalledWith(mockRequest.user, {
        userAgent: mockRequest.headers['user-agent'],
        ipAddress: mockRequest.ip,
      });

      expect(mockResponse.cookie).not.toHaveBeenCalled();

      expect(result).toEqual({
        user: mockRequest.user,
        authToken: 'mock-session-token',
      });
    });

    it('records a safe successful SSO login event', async () => {
      await fixture.controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        undefined,
        mockResponse as unknown as Response,
        '1',
      );

      expect(fixture.identityAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sso_login',
          outcome: 'succeeded',
          actorId: 1,
          subjectId: 1,
          details: { providerId: 1 },
          request: { ipAddress: '127.0.0.1', userAgent: mockRequest.headers['user-agent'] },
        }),
      );
    });

    it('should redirect without leaking user data in URL', async () => {
      const redirectTo = 'http://localhost:3000/dashboard';

      await fixture.controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        redirectTo,
        mockResponse as unknown as Response,
      );

      expect(fixture.cookieConfigService.setAuthCookie).toHaveBeenCalledWith(mockResponse, 'mock-session-token');
      expect(mockResponse.redirect).toHaveBeenCalledWith('http://localhost:3000/dashboard');
    });

    it('should strip account-linking params from redirect URL', async () => {
      const redirectTo = 'http://localhost:3000/dashboard?accountLinking=true&email=test@x.com&ssoLinkToken=abc';

      await fixture.controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        redirectTo,
        mockResponse as unknown as Response,
      );

      expect(mockResponse.redirect).toHaveBeenCalledWith('http://localhost:3000/dashboard');
    });

    it('should prefer redirectTo from OIDC state over query param (fixed callback URI)', async () => {
      const redirectFromState = 'https://app.example.com/from-state';
      (mockRequest as Record<string, unknown>)[SSO_OIDC_REDIRECT_FROM_STATE_REQUEST_KEY] = redirectFromState;

      await fixture.controller.oidcLoginCallback(
        mockRequest as unknown as AuthenticatedRequest,
        'https://app.example.com/from-query',
        mockResponse as unknown as Response,
      );

      expect(mockResponse.redirect).toHaveBeenCalledWith(expect.stringContaining(redirectFromState));
    });
  });
}
