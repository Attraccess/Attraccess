import { AllowCrossSiteWrite } from '../../../common/security/cross-site-write.guard';
import {
  Controller,
  Logger,
  BadRequestException,
  Body,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import {
  ApiTags,
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';

import { CookieConfigService } from '../../../common/services/cookie-config.service';

import { LicenseModuleType } from '../../../license/license.service';

import { RequiresLicense, SkipLicenseCheck } from '../../../license/require-license.decorator';

import { MetricsService } from '../../../metrics/metrics.service';

import { SettingsService } from '../../../settings/settings.service';

import { SSOProvider, SSOProviderType } from '@attraccess/database-entities';

import { Auth, AuthenticatedRequest, AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import { Request, Response } from 'express';

import { SSOProvisioningPermissionsDto, SSOProvisioningUserDto } from './dto/sso-provisioning.dto';

import { LinkUserToExternalAccountRequestDto } from './dto/link-user-to-external-account-request.dto';

import { CreateSSOProviderDto } from './dto/create-sso-provider.dto';

import { UpdateSSOProviderDto } from './dto/update-sso-provider.dto';

import { extractProvisioningToken, parseProviderId } from './sso-request';

import { CreateSessionResponse } from '../auth.types';

import { AccountLinkingExceptionFilter } from './oidc/account-linking.exception-filter';

import { getRedirectToFromRequest } from './oidc/oidc-cookie-state-store';

import { SSOOIDCPassportGuard } from './oidc/oidc-passport.guard';

import { SSOOIDCGuard } from './oidc/oidc.guard';

import { SSOSamlPassportGuard } from './saml/saml-passport.guard';

import { SSOSamlGuard } from './saml/saml.guard';

import { SsoAccountLinkService } from './account-linking/sso-account-link.service';

import { discoveryPathSegment, discoveryUrl, requestDiscoveryJson } from './providers/discovery-client';

import { SsoProviderAdministrationService } from './providers/provider-administration.service';

import { ApiProvisioningRoute } from './provisioning/provisioning-route.decorator';

import { SsoProvisioningService, SsoProvisioningTarget } from './provisioning/sso-provisioning.service';

import { SsoLoginService } from './sso-login.service';

import { SsoIpThrottleService } from './sso-ip-throttle.service';

import { RateLimitScope } from '../../rate-limiting/brute-force.service';

import { resolveIp, setRetryAfter } from '../../rate-limiting/login.rate-limit.guard';

const CLIENT_SECRET = 'SSO client secret';
const PROVISIONING_SECRET = 'SSO provisioning secret';

@ApiTags('Authentication')
@Controller('auth/sso')
@RequiresLicense(LicenseModuleType.SSO)
export class SSOController {
  constructor(
    private readonly providers: SsoProviderAdministrationService,
    private readonly provisioning: SsoProvisioningService,
    private readonly accountLinks: SsoAccountLinkService,
    private readonly login: SsoLoginService,
    private readonly cookieConfigService: CookieConfigService,
    private readonly settingsService: SettingsService,
    private readonly metricsService: MetricsService,
    private readonly ipThrottle: SsoIpThrottleService,
  ) {}

  private readonly logger = new Logger(SSOController.name);

  @Get('providers')
  @SkipLicenseCheck()
  @ApiOperation({ summary: 'Get all SSO providers', operationId: 'getAllSSOProviders' })
  @ApiResponse({
    status: 200,
    description: 'The list of SSO providers',
    type: SSOProvider,
    isArray: true,
  })
  async getAll(): Promise<SSOProvider[]> {
    return this.providers.getAll();
  }

  @Post('/link-account')
  @SkipLicenseCheck()
  @ApiOperation({
    summary: 'Link an account to an SSO identity via a signed token',
    operationId: 'linkUserToExternalAccount',
  })
  @ApiResponse({
    status: 200,
    description: 'The account has been linked to the SSO identity',
    schema: {
      type: 'object',
      properties: {
        OK: {
          type: 'boolean',
          description: 'Whether the account has been linked to the SSO identity',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid, expired, used or exhausted link token, or wrong password' })
  @ApiResponse({ status: 423, description: 'The account is locked after too many failed attempts' })
  @ApiResponse({ status: 429, description: 'Too many attempts from this IP address' })
  public async linkUserToExternalAccount(
    @Body() body: LinkUserToExternalAccountRequestDto,
    @Req() request: Request,
  ): Promise<{ OK: boolean }> {
    const ip = resolveIp(request);
    // A throttled IP is refused before any token work, so garbage tokens do not bypass the limit.
    await this.throttleIp('sso_link_account', request, ip, null);

    const linkPayload = await this.accountLinks.verifyLinkToken(body.linkToken, ip);
    await this.throttleIp('sso_link_account', request, ip, linkPayload.email);

    try {
      return await this.accountLinks.link(linkPayload, body.password, ip);
    } catch (error) {
      // A locked account answers with Retry-After.
      setRetryAfter(request.res as Response, error);
      throw error;
    }
  }

  @Get('providers/:id')
  @Auth('system.sso.manage')
  @ApiOperation({ summary: 'Get SSO provider by ID with full configuration', operationId: 'getOneSSOProviderById' })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'The ID of the SSO provider',
  })
  @ApiResponse({
    status: 200,
    description: 'The SSO provider with full configuration',
    type: SSOProvider,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Provider not found',
  })
  async getOneById(@Param('id') id: string): Promise<SSOProvider> {
    return this.providers.getOneWithConfiguration(parseInt(id, 10));
  }

  @Post('providers')
  @Auth('system.sso.manage')
  @ApiOperation({ summary: 'Create a new SSO provider', operationId: 'createOneSsoProvider' })
  @ApiBody({ type: CreateSSOProviderDto })
  @ApiResponse({
    status: 201,
    description: 'The SSO provider has been created',
    type: SSOProvider,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  async createOne(@Body() createDto: CreateSSOProviderDto, @Req() request: AuthenticatedRequest): Promise<SSOProvider> {
    return this.providers.create(createDto, request.user as AuthenticatedUser);
  }

  @Put('providers/:id')
  @Auth('system.sso.manage')
  @ApiOperation({ summary: 'Update an existing SSO provider', operationId: 'updateOneSSOProvider' })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'The ID of the SSO provider',
  })
  @ApiBody({ type: UpdateSSOProviderDto })
  @ApiResponse({
    status: 200,
    description: 'The SSO provider has been updated',
    type: SSOProvider,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Provider not found',
  })
  async updateOne(
    @Param('id') id: string,
    @Body() updateDto: UpdateSSOProviderDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<SSOProvider> {
    return this.providers.update(parseInt(id, 10), updateDto, request.user as AuthenticatedUser);
  }

  @Delete('providers/:id')
  @Auth('system.sso.manage')
  @ApiOperation({ summary: 'Delete an SSO provider', operationId: 'deleteOneSSOProvider' })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'The ID of the SSO provider',
  })
  @ApiResponse({
    status: 200,
    description: 'The SSO provider has been deleted',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Provider not found',
  })
  async deleteOne(@Param('id') id: string, @Req() request: AuthenticatedRequest): Promise<void> {
    await this.providers.delete(parseInt(id, 10), request.user as AuthenticatedUser);
  }

  @Get('discovery/authentik')
  @Auth('system.sso.manage')
  @ApiOperation({ summary: 'Proxy Authentik OIDC well-known discovery', operationId: 'discoverAuthentikOidc' })
  @ApiQuery({ name: 'host', required: true, description: 'Authentik host, e.g. http://localhost:9000' })
  @ApiQuery({ name: 'applicationName', required: true, description: 'Authentik application slug' })
  @ApiResponse({ status: 200, description: 'OIDC configuration JSON' })
  @ApiBadRequestResponse({ description: 'Invalid host or applicationName' })
  @ApiBadGatewayResponse({ description: 'Discovery URL could not be reached or returned an invalid response' })
  async discoverAuthentik(@Query('host') host: string, @Query('applicationName') applicationName: string) {
    if (typeof host !== 'string' || typeof applicationName !== 'string' || !host || !applicationName) {
      throw new BadRequestException('Missing required parameters');
    }

    const target = discoveryUrl(
      host,
      `/application/o/${discoveryPathSegment(applicationName)}/.well-known/openid-configuration`,
    );
    return requestDiscoveryJson(target);
  }

  @Get('discovery/keycloak')
  @Auth('system.sso.manage')
  @ApiOperation({ summary: 'Proxy Keycloak OIDC well-known discovery', operationId: 'discoverKeycloakOidc' })
  @ApiQuery({ name: 'host', required: true, description: 'Keycloak host, e.g. http://localhost:8080' })
  @ApiQuery({ name: 'realm', required: true, description: 'Keycloak realm name' })
  @ApiResponse({ status: 200, description: 'OIDC configuration JSON' })
  @ApiBadRequestResponse({ description: 'Invalid host or realm' })
  @ApiBadGatewayResponse({ description: 'Discovery URL could not be reached or returned an invalid response' })
  async discoverKeycloak(@Query('host') host: string, @Query('realm') realm: string) {
    if (typeof host !== 'string' || typeof realm !== 'string' || !host || !realm) {
      throw new BadRequestException('Missing required parameters');
    }

    const target = discoveryUrl(host, `/realms/${discoveryPathSegment(realm)}/.well-known/openid-configuration`);
    return requestDiscoveryJson(target);
  }

  @AllowCrossSiteWrite()
  @Post(`/${SSOProviderType.OIDC}/:providerId/logout`)
  @ApiProvisioningRoute({
    summary: 'SSO-initiated logout',
    operationId: 'ssoOidcLogout',
    secret: CLIENT_SECRET,
    body: SSOProvisioningUserDto,
    done: 'All user sessions have been revoked',
  })
  async oidcLogout(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningUserDto,
  ): Promise<{ OK: boolean }> {
    const target = await this.authorizeProvisioning(SSOProviderType.OIDC, providerId, request);
    await this.provisioning.revokeSessions(target, body);
    return { OK: true };
  }

  @AllowCrossSiteWrite()
  @Post(`/${SSOProviderType.SAML}/:providerId/logout`)
  @ApiProvisioningRoute({
    summary: 'SAML-initiated logout',
    operationId: 'ssoSamlLogout',
    secret: PROVISIONING_SECRET,
    body: SSOProvisioningUserDto,
    done: 'All user sessions have been revoked',
  })
  async samlLogout(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningUserDto,
  ): Promise<{ OK: boolean }> {
    const target = await this.authorizeProvisioning(SSOProviderType.SAML, providerId, request);
    await this.provisioning.revokeSessions(target, body);
    return { OK: true };
  }

  @AllowCrossSiteWrite()
  @Post(`/${SSOProviderType.OIDC}/:providerId/users/delete`)
  @ApiProvisioningRoute({
    summary: 'SSO-initiated user deletion',
    operationId: 'ssoOidcDeleteUser',
    secret: CLIENT_SECRET,
    body: SSOProvisioningUserDto,
    done: 'The user has been deleted',
  })
  async oidcDeleteUser(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningUserDto,
  ): Promise<{ OK: boolean }> {
    const target = await this.authorizeProvisioning(SSOProviderType.OIDC, providerId, request);
    await this.provisioning.deleteUser(target, body);
    return { OK: true };
  }

  @AllowCrossSiteWrite()
  @Post(`/${SSOProviderType.SAML}/:providerId/users/delete`)
  @ApiProvisioningRoute({
    summary: 'SAML-initiated user deletion',
    operationId: 'ssoSamlDeleteUser',
    secret: PROVISIONING_SECRET,
    body: SSOProvisioningUserDto,
    done: 'The user has been deleted',
  })
  async samlDeleteUser(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningUserDto,
  ): Promise<{ OK: boolean }> {
    const target = await this.authorizeProvisioning(SSOProviderType.SAML, providerId, request);
    await this.provisioning.deleteUser(target, body);
    return { OK: true };
  }

  @AllowCrossSiteWrite()
  @Post(`/${SSOProviderType.OIDC}/:providerId/users/permissions`)
  @ApiProvisioningRoute({
    summary: 'SSO-initiated permission update',
    operationId: 'ssoOidcUpdatePermissions',
    secret: CLIENT_SECRET,
    body: SSOProvisioningPermissionsDto,
    done: 'The user permissions have been updated',
  })
  async oidcUpdatePermissions(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningPermissionsDto,
  ): Promise<{ OK: boolean }> {
    const target = await this.authorizeProvisioning(SSOProviderType.OIDC, providerId, request);
    await this.provisioning.updatePermissions(target, body);
    return { OK: true };
  }

  @AllowCrossSiteWrite()
  @Post(`/${SSOProviderType.SAML}/:providerId/users/permissions`)
  @ApiProvisioningRoute({
    summary: 'SAML-initiated permission update',
    operationId: 'ssoSamlUpdatePermissions',
    secret: PROVISIONING_SECRET,
    body: SSOProvisioningPermissionsDto,
    done: 'The user permissions have been updated',
  })
  async samlUpdatePermissions(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningPermissionsDto,
  ): Promise<{ OK: boolean }> {
    const target = await this.authorizeProvisioning(SSOProviderType.SAML, providerId, request);
    await this.provisioning.updatePermissions(target, body);
    return { OK: true };
  }

  @Get(`/${SSOProviderType.OIDC}/:providerId/login`)
  @ApiOperation({
    summary: 'Login with OIDC',
    description:
      'Login with OIDC and redirect to the callback URL (optional), if you intend to redirect to your frontned,' +
      ' your frontend should pass the query parameters back to the sso callback endpoint' +
      ' to retreive a JWT token for furhter authentication',
    operationId: 'loginWithOidc',
  })
  @ApiResponse({
    status: 200,
    description: 'The user has been logged in',
  })
  @ApiQuery({
    name: 'redirectTo',
    required: false,
    description:
      'The URL to redirect to after login (optional), if you intend to redirect to your frontned,' +
      ' your frontend should pass the query parameters back to the sso callback endpoint' +
      ' to retreive a JWT token for furhter authentication',
  })
  @ApiParam({
    name: 'providerId',
    type: 'string',
    description: 'The ID of the SSO provider',
  })
  @UseGuards(SSOOIDCGuard, SSOOIDCPassportGuard)
  async loginWithOidc(): Promise<HttpStatus.OK> {
    return HttpStatus.OK;
  }

  @Get(`/${SSOProviderType.OIDC}/:providerId/callback`)
  @ApiOperation({ summary: 'Callback for OIDC login', operationId: 'oidcLoginCallback' })
  @ApiResponse({
    status: 200,
    description: 'The user has been logged in',
    type: CreateSessionResponse,
  })
  @ApiParam({
    name: 'providerId',
    type: 'string',
    description: 'The ID of the SSO provider',
  })
  @ApiQuery({
    name: 'state',
    required: true,
  })
  @ApiQuery({
    name: 'session-state',
    required: true,
  })
  @ApiQuery({
    name: 'iss',
    required: true,
  })
  @ApiQuery({
    name: 'code',
    required: true,
  })
  @UseGuards(SSOOIDCGuard, SSOOIDCPassportGuard)
  @UseFilters(AccountLinkingExceptionFilter)
  async oidcLoginCallback(
    @Req() request: AuthenticatedRequest,
    @Query('redirectTo') redirectToQuery: string | undefined,
    @Res({ passthrough: true }) response: Response,
    @Param('providerId') providerId?: string,
  ): Promise<CreateSessionResponse | void> {
    const redirectTo = getRedirectToFromRequest(request as unknown as Record<string, unknown>, redirectToQuery);
    this.metricsService.authSsoLoginTotal.inc({ provider_type: 'oidc' });
    return this.finalizeLogin(request, response, redirectTo, providerId ? parseProviderId(providerId) : undefined);
  }

  @Get(`/${SSOProviderType.SAML}/:providerId/login`)
  @ApiOperation({
    summary: 'Login with SAML',
    description:
      'Initiate a SAML authentication request. Redirect the resulting browser request back to the callback endpoint to mint an API session token.',
    operationId: 'loginWithSaml',
  })
  @ApiResponse({
    status: 200,
    description: 'SAML authentication initiated',
  })
  @ApiQuery({
    name: 'redirectTo',
    required: false,
    description: 'URL that should receive the resulting session payload after authentication succeeds.',
  })
  @ApiParam({
    name: 'providerId',
    type: 'string',
    description: 'The ID of the SSO provider',
  })
  @UseGuards(SSOSamlGuard, SSOSamlPassportGuard)
  async loginWithSaml(): Promise<HttpStatus.OK> {
    return HttpStatus.OK;
  }

  @AllowCrossSiteWrite()
  @Post(`/${SSOProviderType.SAML}/:providerId/callback`)
  @ApiOperation({ summary: 'Callback for SAML login', operationId: 'samlLoginCallback' })
  @ApiResponse({
    status: 200,
    description: 'The user has been logged in',
    type: CreateSessionResponse,
  })
  @ApiParam({
    name: 'providerId',
    type: 'string',
    description: 'The ID of the SSO provider',
  })
  @UseGuards(SSOSamlGuard, SSOSamlPassportGuard)
  @UseFilters(AccountLinkingExceptionFilter)
  async samlLoginCallback(
    @Req() request: AuthenticatedRequest,
    @Query('redirectTo') redirectTo: string,
    @Body('RelayState') relayState: string,
    @Query('RelayState') relayStateQuery: string,
    @Res({ passthrough: true }) response: Response,
    @Param('providerId') providerId?: string,
  ): Promise<CreateSessionResponse | void> {
    const defaultRedirect = await this.settingsService.getUrl();
    const target = redirectTo || relayState || relayStateQuery || defaultRedirect;
    this.metricsService.authSsoLoginTotal.inc({ provider_type: 'saml' });
    return this.finalizeLogin(request, response, target, providerId ? parseProviderId(providerId) : undefined);
  }

  private async finalizeLogin(
    request: AuthenticatedRequest,
    response: Response,
    redirectTo?: string,
    providerId?: number,
  ): Promise<CreateSessionResponse | void> {
    const sessionToken = await this.login.createSession(request, providerId);

    await this.cookieConfigService.setAuthCookie(response, sessionToken);

    const auth: CreateSessionResponse = {
      user: request.user,
      authToken: sessionToken,
    };

    if (redirectTo) {
      const redirectUrl = new URL(redirectTo);
      redirectUrl.searchParams.delete('accountLinking');
      redirectUrl.searchParams.delete('email');
      redirectUrl.searchParams.delete('ssoLinkToken');

      this.logger.debug('Redirecting to', redirectUrl.toString());
      return response.redirect(redirectUrl.toString());
    }

    return auth;
  }

  /** Throttled per IP and provider before the secret check; see {@link SsoProvisioningService.verifySecret}. */
  private async authorizeProvisioning(
    type: SSOProviderType,
    rawProviderId: string,
    request: Request,
  ): Promise<SsoProvisioningTarget> {
    const providerId = parseProviderId(rawProviderId);
    const provider = await this.provisioning.loadProvider(type, providerId);
    const ip = resolveIp(request);
    const username = `provider:${provider.type}:${provider.id}`;
    await this.throttleIp('sso_provisioning', request, ip, username);
    await this.provisioning.verifySecret(provider, ip, username, extractProvisioningToken(request));
    return { type, providerId, provider };
  }

  /** Throws 429 (with Retry-After) while the IP is throttled for this account (or, with no username, at all). */
  private async throttleIp(
    type: Extract<RateLimitScope, 'sso_link_account' | 'sso_provisioning'>,
    request: Request,
    ip: string,
    username: string | null,
  ): Promise<void> {
    try {
      await this.ipThrottle.assertIpAllowed(type, ip, username);
    } catch (error) {
      setRetryAfter(request.res as Response, error);
      throw error;
    }
  }
}
