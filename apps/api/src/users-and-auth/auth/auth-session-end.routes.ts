import { AuthenticatedRequest, SessionAuth } from '@attraccess/plugins-backend-sdk';
import { Delete, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AuthSessionRefreshRoutesImplementation } from './auth-session-refresh.routes';
export abstract class AuthSessionEndRoutesImplementation extends AuthSessionRefreshRoutesImplementation {
  @Delete('/session')
  @SessionAuth()
  @ApiOperation({ summary: 'Logout and invalidate the current session', operationId: 'endSession' })
  @ApiOkResponse({
    description: 'The session has been deleted',
    schema: {
      type: 'object',
      properties: {},
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User is not authenticated',
  })
  async endSession(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    // Get session token from cookie or header
    const cookieToken = request.cookies?.[this.cookieConfigService.getCookieName()];
    const headerToken = request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.substring(7)
      : null;

    const sessionToken = headerToken || cookieToken;

    // Clear authentication cookie regardless of request type
    await this.cookieConfigService.clearAuthCookie(response);

    // Revoke session token if present
    if (sessionToken) {
      await this.sessionService.revokeSession(sessionToken);
    }

    // Passport clears request.user as part of logout, so retain the principal for the audit record.
    const principal = {
      userId: request.user.id,
      authenticationMethod: request.user.authenticationMethod ?? 'session',
      apiTokenId: request.user.apiTokenId,
    };
    const logout = request.logout as unknown as (callback: (error?: Error) => void) => void;
    await new Promise<void>((resolve, reject) => logout.call(request, (error) => (error ? reject(error) : resolve())));
    await this.identityAudit?.record({
      action: 'logout',
      operationId: randomUUID(),
      outcome: 'succeeded',
      actorId: principal.userId,
      authenticationMethod: principal.authenticationMethod,
      apiTokenId: principal.apiTokenId,
      subjectId: principal.userId,
      details: {},
      request: { ipAddress: request.ip, userAgent: request.headers['user-agent'] },
    });
  }
}
