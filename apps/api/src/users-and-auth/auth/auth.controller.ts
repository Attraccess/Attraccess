import { ForbiddenException } from '@nestjs/common';
import { SsoLogoutService } from './sso/sso-logout.service';
import { CentralLogoutResult, LogoutCapability } from './sso/logout.types';
import {
  UnauthorizedException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Optional,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { SessionAuthenticatedRequest } from './session-request';
import { SessionService } from './session.service';
import { LoginRateLimitGuard } from '../rate-limiting/login.rate-limit.guard';
import { AuthenticatedRequest, SessionAuth } from '@attraccess/plugins-backend-sdk';
import { CreateSessionResponse } from './auth.types';
import { ApiBody, ApiOkResponse, ApiResponse, ApiTags, ApiOperation } from '@nestjs/swagger';
import { CookieConfigService } from '../../common/services/cookie-config.service';
import { IdentityAuditService } from '../../audit/identity-audit.service';
import { randomUUID } from 'node:crypto';
import { ApprovedOriginsService } from '../../common/security/approved-origins.service';
import { SessionPermissionSync } from './sso/session-permission-sync';

@ApiTags('Authentication')
@Controller('/auth')
export class AuthController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly cookieConfigService: CookieConfigService,
    @Optional() private readonly identityAudit?: IdentityAuditService,
    @Optional() private readonly ssoLogout?: SsoLogoutService,
    @Optional() private readonly ssoPermissionSync?: SessionPermissionSync,
    @Optional() private readonly approvedOrigins?: ApprovedOriginsService,
  ) {}

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
    description:
      'Invalid credentials, or TwoFactorRequired after valid credentials when an authenticator code is needed',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Email address or username' },
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

  @Post('/session/refresh')
  @HttpCode(200)
  @SessionAuth()
  @ApiOperation({
    summary:
      'Refresh the current session. Cookie sessions receive a rotated cookie and no token; bearer callers receive a new token.',
    operationId: 'refreshSession',
  })
  @ApiOkResponse({
    description: 'The session has been refreshed',
    type: CreateSessionResponse,
  })
  async refreshSession(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreateSessionResponse> {
    const currentToken = this.sessionToken(request);

    if (!currentToken) throw new UnauthorizedException('An active session is required');

    // Session refresh re-evaluates SSO roles even before the re-sync interval elapses.
    const authSession = (request as SessionAuthenticatedRequest).authSession;
    if (
      authSession &&
      (await this.ssoPermissionSync?.syncIfDue(authSession, request.user.id, { force: true })) === 'revoked'
    ) {
      throw new UnauthorizedException('Session was ended by the identity provider');
    }

    // Refresh the session token
    const newToken = await this.sessionService.refreshSession(currentToken);

    if (!newToken) throw new UnauthorizedException('Session was ended or expired');

    response.setHeader('Cache-Control', 'no-store');
    if (this.bearerToken(request)) {
      // Programmatic clients already hold the credential; they receive the new one.
      return { user: request.user, authToken: newToken };
    }

    // Browser sessions never expose the token to page scripts.
    await this.cookieConfigService.setAuthCookie(response, newToken);
    return { user: request.user, authToken: '' };
  }

  private bearerToken(request: AuthenticatedRequest): string {
    return request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.substring(7).trim()
      : '';
  }

  private sessionToken(request: AuthenticatedRequest): string | null {
    return this.bearerToken(request) || request.cookies?.[this.cookieConfigService.getCookieName()] || null;
  }

  @Get('/session/logout-capability')
  @SessionAuth()
  @ApiOperation({ summary: 'Central logout availability for the current session', operationId: 'getLogoutCapability' })
  @ApiOkResponse({ type: LogoutCapability })
  async logoutCapability(@Req() request: SessionAuthenticatedRequest): Promise<LogoutCapability> {
    const token = this.sessionToken(request);
    if (!token || request.user.apiTokenId) return { available: false, reason: 'local_session' };
    return this.ssoLogout.capability(request.authSession?.ssoContext ?? null);
  }

  @Post('/session/logout-everywhere')
  @SessionAuth()
  @ApiOperation({ summary: 'End the current session and initiate provider logout', operationId: 'logoutEverywhere' })
  @ApiOkResponse({ type: CentralLogoutResult })
  async logoutEverywhere(
    @Req() request: SessionAuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CentralLogoutResult> {
    const token = this.sessionToken(request);
    if (!token || request.user.apiTokenId) throw new UnauthorizedException('An active session is required');
    const session = request.authSession;
    if (!session) throw new UnauthorizedException('An active session is required');
    // Bearer callers skip the global cross-site guard, so check the origin here as well.
    const origin = request.headers.origin;
    const approved = await this.approvedOrigins.isApproved(origin, request);
    if ((origin && !approved) || (!origin && request.headers['sec-fetch-site'] === 'cross-site'))
      throw new ForbiddenException('Cross-origin logout is not allowed');
    let result: CentralLogoutResult;
    try {
      result = await this.ssoLogout.prepare(session.ssoContext);
    } catch {
      result = { kind: 'local_only', reason: 'provider_failed' };
    } finally {
      await this.sessionService.revokeLogoutSession(session.id);
      await this.finishLogout(request, response);
    }
    response.setHeader('Cache-Control', 'no-store');
    return result;
  }

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
    @Req() request: SessionAuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const sessionToken = this.sessionToken(request);

    // End server access before cookie clearing or Passport/auditing can fail.
    if (sessionToken && !request.user.apiTokenId) {
      if (!request.authSession) throw new UnauthorizedException('An active session is required');
      await this.sessionService.revokeLogoutSession(request.authSession.id);
    }
    await this.finishLogout(request, response);
  }

  private async finishLogout(request: AuthenticatedRequest, response: Response): Promise<void> {
    await this.cookieConfigService.clearAuthCookie(response);

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
