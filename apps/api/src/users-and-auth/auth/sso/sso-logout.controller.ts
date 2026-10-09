import { SessionAuth } from '@attraccess/plugins-backend-sdk';
import { LogoutReturnResult, SsoLogoutSetupUrls } from './logout.types';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags, ApiOkResponse, ApiBody } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { SsoLogoutService } from './sso-logout.service';
import { CookieConfigService } from '../../../common/services/cookie-config.service';

@ApiTags('SSO')
@Controller('/auth/sso')
export class SsoLogoutController {
  constructor(
    private readonly logout: SsoLogoutService,
    private readonly cookies: CookieConfigService,
  ) {}

  @Post('/logout-result')
  @HttpCode(200)
  @ApiOperation({ summary: 'Consume a one-time provider logout result', operationId: 'consumeLogoutResult' })
  @ApiBody({ schema: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } } })
  @ApiOkResponse({ type: LogoutReturnResult })
  async consumeResult(
    @Body('token') token: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LogoutReturnResult> {
    response.setHeader('Cache-Control', 'no-store');
    return this.logout.consumeResult(token);
  }

  @Get('/:providerId/logout-urls')
  @SessionAuth()
  @ApiOperation({
    summary: 'Provider logout registration URLs from trusted application settings',
    operationId: 'getSsoLogoutUrls',
  })
  @ApiOkResponse({ type: SsoLogoutSetupUrls })
  async setupUrls(@Param('providerId', ParseIntPipe) id: number): Promise<SsoLogoutSetupUrls> {
    const postLogoutUrl = await this.logout.callbackURL('OIDC', id);
    return {
      postLogoutUrl,
      backchannelLogoutUrl: postLogoutUrl.replace(/post-logout$/, 'backchannel-logout'),
      frontchannelLogoutUrl: postLogoutUrl.replace(/post-logout$/, 'frontchannel-logout'),
      samlSloUrl: await this.logout.callbackURL('SAML', id),
    };
  }

  @Post('/OIDC/:providerId/backchannel-logout')
  @HttpCode(200)
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiOperation({ summary: 'Receive a signed OIDC logout token', operationId: 'oidcBackchannelLogout' })
  async backchannel(
    @Param('providerId', ParseIntPipe) id: number,
    @Body('logout_token') token: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    await this.logout.backchannel(id, token);
    return {};
  }

  @Get('/OIDC/:providerId/frontchannel-logout')
  @ApiOperation({ summary: 'Receive an OIDC browser logout notification', operationId: 'oidcFrontchannelLogout' })
  async frontchannel(
    @Param('providerId', ParseIntPipe) id: number,
    @Query('iss') issuer: unknown,
    @Query('sid') sid: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    response.removeHeader('X-Frame-Options');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors *");
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (await this.logout.frontchannel(id, issuer, sid, request.cookies?.[this.cookies.getCookieName()]))
      await this.cookies.clearAuthCookie(response);
    response.type('html').send('<!doctype html><title>Logout notification</title>');
  }

  @Get('/OIDC/:providerId/post-logout')
  @ApiOperation({ summary: 'Complete a correlated OIDC logout exchange', operationId: 'oidcPostLogout' })
  async oidcReturn(
    @Param('providerId', ParseIntPipe) id: number,
    @Query('state') state: unknown,
    @Res() response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.redirect(await this.logout.oidcReturn(id, state));
  }

  @Get('/SAML/:providerId/slo')
  @ApiOperation({ summary: 'SAML Single Logout via Redirect binding', operationId: 'samlRedirectLogout' })
  async samlGet(
    @Param('providerId', ParseIntPipe) id: number,
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const original = request.originalUrl.split('?').slice(1).join('?');
    await this.saml(id, query, original, response);
  }

  @Post('/SAML/:providerId/slo')
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiOperation({ summary: 'SAML Single Logout via POST binding', operationId: 'samlPostLogout' })
  async samlPost(
    @Param('providerId', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @Res() response: Response,
  ) {
    await this.saml(id, body, null, response);
  }

  private async saml(id: number, body: Record<string, unknown>, original: string | null, response: Response) {
    const container: Record<string, string> = {};
    for (const key of ['SAMLRequest', 'SAMLResponse', 'RelayState', 'Signature', 'SigAlg']) {
      if (body[key] === undefined) continue;
      if (typeof body[key] !== 'string' || (body[key] as string).length > (key.startsWith('SAML') ? 350000 : 4096))
        throw new BadRequestException('Invalid SAML parameters');
      container[key] = body[key] as string;
    }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.redirect(await this.logout.samlMessage(id, container, original));
  }
}
