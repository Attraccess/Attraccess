import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { LoginRateLimitGuard } from '../rate-limiting/login.rate-limit.guard';
import { AuthControllerRouteContext } from './auth.controller.route-context';
import { CreateSessionResponse } from './auth.types';
export abstract class AuthSessionCreationRoutesImplementation extends AuthControllerRouteContext {
  @Post('/session/local')
  @UseGuards(LoginRateLimitGuard)
  @ApiOperation({ summary: 'Create a new session using local authentication', operationId: 'createSession' })
  @ApiResponse({
    status: 200,
    description: 'The session has been created',
    type: CreateSessionResponse,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid credentials',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
        twoFactorCode: { type: 'string' },
        tokenLocation: { type: 'string', enum: ['cookie', 'body'] },
      },
    },
  })
  async createSession(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: { tokenLocation: 'cookie' | 'body'; twoFactorCode?: string },
  ): Promise<CreateSessionResponse> {
    // Create session token using SessionService
    const sessionToken = await this.sessionService.createSession(request.user, {
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip || request.connection.remoteAddress,
    });

    if (body.tokenLocation === 'cookie') {
      // Set HTTP-only cookie for web browsers
      await this.cookieConfigService.setAuthCookie(response, sessionToken);

      // Return user data without token for web browsers
      return {
        user: request.user,
        authToken: '', // Empty token for web browsers using cookies
      };
    } else {
      // Return token in response body for programmatic clients
      return {
        user: request.user,
        authToken: sessionToken,
      };
    }
  }
}
