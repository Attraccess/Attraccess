import { AuthenticatedRequest, SessionAuth } from '@attraccess/plugins-backend-sdk';
import { Get, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthSessionCreationRoutesImplementation } from './auth-session-creation.routes';
import { CreateSessionResponse } from './auth.types';
export abstract class AuthSessionRefreshRoutesImplementation extends AuthSessionCreationRoutesImplementation {
  @Get('/session/refresh')
  @SessionAuth()
  @ApiOperation({ summary: 'Refresh the current session', operationId: 'refreshSession' })
  @ApiOkResponse({
    description: 'The session has been refreshed',
    type: CreateSessionResponse,
  })
  async refreshSession(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Query('tokenLocation') tokenLocation: 'cookie' | 'body',
  ): Promise<CreateSessionResponse> {
    // Get current session token from cookie or header
    const cookieToken = request.cookies?.[this.cookieConfigService.getCookieName()];
    const headerToken = request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.substring(7)
      : null;

    const currentToken = headerToken || cookieToken;

    if (!currentToken) {
      // Create a new session if no current token exists
      const sessionToken = await this.sessionService.createSession(request.user, {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip || request.connection.remoteAddress,
      });

      return {
        user: request.user,
        authToken: sessionToken,
      };
    }

    // Refresh the session token
    const newToken = await this.sessionService.refreshSession(currentToken);

    if (!newToken) {
      // If session refresh failed, create a new session
      const sessionToken = await this.sessionService.createSession(request.user, {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip || request.connection.remoteAddress,
      });

      if (tokenLocation === 'cookie') {
        await this.cookieConfigService.setAuthCookie(response, sessionToken);
        return {
          user: request.user,
          authToken: '',
        };
      } else {
        return {
          user: request.user,
          authToken: sessionToken,
        };
      }
    }

    if (tokenLocation === 'cookie') {
      // Update cookie with new token
      await this.cookieConfigService.setAuthCookie(response, newToken);
      return {
        user: request.user,
        authToken: '',
      };
    } else {
      // Return new token for programmatic clients
      return {
        user: request.user,
        authToken: newToken,
      };
    }
  }
}
