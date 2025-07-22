import { Body, Controller, Delete, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { SessionService } from './session.service';
import { LoginGuard } from '../strategies/login.guard';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { CreateSessionResponse } from './auth.types';
import { ApiBody, ApiOkResponse, ApiResponse, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AppConfigType } from '../../config/app.config';

@ApiTags('Authentication')
@Controller('/auth')
export class AuthController {
  constructor(private sessionService: SessionService, private configService: ConfigService) {}

  /**
   * Gets cookie configuration based on environment
   */
  private getCookieConfig() {
    const appConfig = this.configService.get<AppConfigType>('app');
    const isSecure = appConfig?.ATTRACCESS_URL?.startsWith('https://') ?? false;

    return {
      name: 'auth-session',
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax' as const,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
      path: '/',
    };
  }

  /**
   * Sets authentication cookie on the response
   */
  private setAuthCookie(res: Response, token: string): void {
    const cookieConfig = this.getCookieConfig();
    res.cookie(cookieConfig.name, token, {
      httpOnly: cookieConfig.httpOnly,
      secure: cookieConfig.secure,
      sameSite: cookieConfig.sameSite,
      maxAge: cookieConfig.maxAge,
      path: cookieConfig.path,
    });
  }

  /**
   * Clears authentication cookie from the response
   */
  private clearAuthCookie(res: Response): void {
    const cookieConfig = this.getCookieConfig();
    res.clearCookie(cookieConfig.name, {
      httpOnly: cookieConfig.httpOnly,
      secure: cookieConfig.secure,
      sameSite: cookieConfig.sameSite,
      path: cookieConfig.path,
    });
  }

  @Post('/session/local')
  @UseGuards(LoginGuard)
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
        tokenLocation: { type: 'string', enum: ['cookie', 'body'] },
      },
    },
  })
  async createSession(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() body: { tokenLocation: 'cookie' | 'body' }
  ): Promise<CreateSessionResponse> {
    // Create session token using SessionService
    const sessionToken = await this.sessionService.createSession(request.user, {
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip || request.connection.remoteAddress,
    });

    if (body.tokenLocation === 'cookie') {
      // Set HTTP-only cookie for web browsers
      this.setAuthCookie(response, sessionToken);

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

  @Get('/session/refresh')
  @Auth()
  @ApiOperation({ summary: 'Refresh the current session', operationId: 'refreshSession' })
  @ApiOkResponse({
    description: 'The session has been refreshed',
    type: CreateSessionResponse,
  })
  async refreshSession(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Query('tokenLocation') tokenLocation: 'cookie' | 'body'
  ): Promise<CreateSessionResponse> {
    // Get current session token from cookie or header
    const cookieToken = request.cookies?.['auth-session'];
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
        this.setAuthCookie(response, sessionToken);
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
      this.setAuthCookie(response, newToken);
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

  @Delete('/session')
  @Auth()
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
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    // Get session token from cookie or header
    const cookieToken = request.cookies?.['auth-session'];
    const headerToken = request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.substring(7)
      : null;

    const sessionToken = headerToken || cookieToken;

    // Clear authentication cookie regardless of request type
    this.clearAuthCookie(response);

    // Revoke session token if present
    if (sessionToken) {
      await this.sessionService.revokeSession(sessionToken);
    }

    // Logout from passport session
    await new Promise<void>((resolve) => request.logout(resolve));
  }
}
