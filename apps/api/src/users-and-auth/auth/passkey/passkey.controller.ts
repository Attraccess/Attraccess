import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest, SessionAuth } from '@attraccess/plugins-backend-sdk';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { Passkey } from '@attraccess/database-entities';
import { PasskeyService } from './passkey.service';
import {
  PasskeyOptionsResponseDto,
  PasskeySessionDto,
  RenamePasskeyDto,
  VerifyPasskeyRegistrationDto,
} from './passkey.dto';
import { SessionService } from '../session.service';
import { CreateSessionResponse } from '../auth.types';
import { CookieConfigService } from '../../../common/services/cookie-config.service';
import { BruteForceProtectionService } from '../../rate-limiting/brute-force.service';
import { AuthAuditLogger } from '../../rate-limiting/auth-audit.logger';
import { resolveIp, setRetryAfter } from '../../rate-limiting/login.rate-limit.guard';

@ApiTags('Passkeys')
@Controller('/auth')
export class PasskeyController {
  constructor(
    private readonly passkeyService: PasskeyService,
    private readonly sessionService: SessionService,
    private readonly cookieConfigService: CookieConfigService,
    private readonly bruteForce: BruteForceProtectionService,
    private readonly audit: AuthAuditLogger,
  ) {}

  @SessionAuth()
  @Get('/passkey')
  @ApiOperation({ summary: 'List the passkeys of the current user', operationId: 'listPasskeys' })
  @ApiOkResponse({ description: 'The passkeys of the current user', type: [Passkey] })
  async list(@Req() request: AuthenticatedRequest): Promise<Passkey[]> {
    return this.passkeyService.listForUser(request.user.id);
  }

  @SessionAuth()
  @Post('/passkey/register/options')
  @ApiOperation({ summary: 'Start registering a new passkey', operationId: 'getPasskeyRegistrationOptions' })
  @ApiOkResponse({ description: 'The WebAuthn credential creation options', type: PasskeyOptionsResponseDto })
  async registrationOptions(@Req() request: AuthenticatedRequest): Promise<PasskeyOptionsResponseDto> {
    const options = await this.passkeyService.createRegistrationOptions(request.user, requestOrigin(request));
    return { options: options as unknown as Record<string, unknown> };
  }

  @SessionAuth()
  @Post('/passkey/register/verify')
  @ApiOperation({ summary: 'Finish registering a new passkey', operationId: 'verifyPasskeyRegistration' })
  @ApiOkResponse({ description: 'The newly registered passkey', type: Passkey })
  @ApiResponse({ status: 400, description: 'The registration could not be verified' })
  async verifyRegistration(
    @Req() request: AuthenticatedRequest,
    @Body() body: VerifyPasskeyRegistrationDto,
  ): Promise<Passkey> {
    return this.passkeyService.verifyRegistration(
      request.user,
      body.response as unknown as RegistrationResponseJSON,
      body.name,
      requestOrigin(request),
    );
  }

  @SessionAuth()
  @Patch('/passkey/:id')
  @ApiOperation({ summary: 'Rename one of the current users passkeys', operationId: 'renamePasskey' })
  @ApiOkResponse({ description: 'The renamed passkey', type: Passkey })
  async rename(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RenamePasskeyDto,
  ): Promise<Passkey> {
    return this.passkeyService.rename(request.user.id, id, body.name);
  }

  @SessionAuth()
  @Delete('/passkey/:id')
  @ApiOperation({ summary: 'Delete one of the current users passkeys', operationId: 'deletePasskey' })
  @ApiOkResponse({ description: 'The passkey has been deleted' })
  async delete(@Req() request: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.passkeyService.delete(request.user.id, id);
  }

  @Post('/passkey/authenticate/options')
  @ApiOperation({ summary: 'Start signing in with a passkey', operationId: 'getPasskeyAuthenticationOptions' })
  @ApiOkResponse({ description: 'The WebAuthn credential request options', type: PasskeyOptionsResponseDto })
  async authenticationOptions(@Req() request: Request): Promise<PasskeyOptionsResponseDto> {
    await this.assertNotThrottled(request);
    const options = await this.passkeyService.createAuthenticationOptions(requestOrigin(request));
    return { options: options as unknown as Record<string, unknown> };
  }

  @Post('/session/passkey')
  @ApiOperation({ summary: 'Create a new session using a passkey', operationId: 'createSessionWithPasskey' })
  @ApiOkResponse({ description: 'The session has been created', type: CreateSessionResponse })
  @ApiResponse({ status: 401, description: 'Unauthorized - the passkey could not be verified' })
  async createSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: PasskeySessionDto,
  ): Promise<CreateSessionResponse> {
    await this.assertNotThrottled(request);
    const ip = resolveIp(request);

    let user;
    try {
      user = await this.passkeyService.verifyAuthentication(
        body.response as unknown as AuthenticationResponseJSON,
        requestOrigin(request),
      );
    } catch (error) {
      await this.bruteForce.recordFailure('login', ip, null);
      this.audit.log({ type: 'login', outcome: 'invalid_credentials', ip, reason: 'passkey_rejected' });
      throw error;
    }

    await this.bruteForce.recordSuccess('login', ip, user.id, user.username);
    this.audit.log({ type: 'login', outcome: 'success', ip, userId: user.id, username: user.username });

    // A passkey proves possession of the authenticator (and usually a biometric/PIN on top of it),
    // so it stands on its own and does not additionally prompt for the TOTP code.
    const sessionToken = await this.sessionService.createSession(user, {
      userAgent: request.headers['user-agent'],
      ipAddress: ip,
    });

    if (body.tokenLocation === 'cookie') {
      await this.cookieConfigService.setAuthCookie(response, sessionToken);
      return { user, authToken: '' };
    }

    return { user, authToken: sessionToken };
  }

  private async assertNotThrottled(request: Request): Promise<void> {
    const ip = resolveIp(request);
    try {
      await this.bruteForce.assertIpAllowed('login', ip);
    } catch (error) {
      setRetryAfter(request.res as Response, error);
      this.audit.log({ type: 'login', outcome: 'rate_limited', ip, reason: 'ip_throttled' });
      throw error;
    }
  }
}

/** The browser origin the ceremony runs in. Sent on every POST; the referer is a dev-proxy fallback. */
function requestOrigin(request: { headers: Request['headers'] }): string | undefined {
  const origin = request.headers.origin;
  if (origin && origin !== 'null') {
    return origin;
  }

  const referer = request.headers.referer;
  if (!referer) {
    return undefined;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
