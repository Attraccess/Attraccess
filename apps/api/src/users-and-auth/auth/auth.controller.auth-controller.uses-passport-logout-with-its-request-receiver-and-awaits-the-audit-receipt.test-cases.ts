import { Response } from 'express';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { registerAuthControllerFixture } from './auth.controller.auth-controller.test-fixture';
export function registerUsesPassportLogoutWithItsRequestReceiverAndAwaitsTheAuditReceiptCases(
  fixture: ReturnType<typeof registerAuthControllerFixture>,
) {
  it('uses Passport logout with its request receiver and awaits the audit receipt', async () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      jwtTokenId: 'test-jwt-token-id',
    };

    const sessionManager = {
      logOut: jest.fn((_request, _options, callback) => callback()),
    };
    const mockRequest = {
      ...Object.create(Request.prototype),
      user: mockUser,
      headers: {
        authorization: 'Bearer test-session-token',
      },
      cookies: {},
      _userProperty: 'user',
      _sessionManager: sessionManager,
      logout: fixture.passportRequest.logout,
    } as AuthenticatedRequest;

    const mockResponse = {
      clearCookie: jest.fn(),
    } as unknown as Response;

    let resolveAudit: () => void;
    fixture.identityAudit.record.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveAudit = resolve;
      }),
    );
    const completed = fixture.authController.endSession(mockRequest, mockResponse);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockRequest.user).toBeNull();
    expect(sessionManager.logOut).toHaveBeenCalledWith(mockRequest, {}, expect.any(Function));
    expect(fixture.sessionService.revokeSession).toHaveBeenCalledWith('test-session-token');
    expect(fixture.cookieConfigService.clearAuthCookie).toHaveBeenCalledWith(mockResponse);
    expect(fixture.identityAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'logout', actorId: 1, subjectId: 1 }),
    );
    if (!resolveAudit) throw new Error('audit receipt was not requested');
    resolveAudit();
    await completed;
  });
}
