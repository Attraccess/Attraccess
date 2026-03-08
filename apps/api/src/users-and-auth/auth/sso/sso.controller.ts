import {
  Body,
  Controller,
  Delete,
  Get,
  Query,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  Res,
  UnauthorizedException,
  UseFilters,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { SSOOIDCGuard } from './oidc/oidc.guard';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticationType, SSOProvider, SSOProviderType, SystemPermissions } from '@attraccess/database-entities';
import { AuthenticatedRequest, Auth } from '@attraccess/plugins-backend-sdk';
import { CreateSessionResponse } from '../auth.types';
import { AuthService } from '../auth.service';
import { SessionService } from '../session.service';
import { SSOService } from './sso.service';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags, ApiHeader } from '@nestjs/swagger';
import { CreateSSOProviderDto } from './dto/create-sso-provider.dto';
import { UpdateSSOProviderDto } from './dto/update-sso-provider.dto';
import { Request, Response } from 'express';
import { LinkUserToExternalAccountRequestDto } from './dto/link-user-to-external-account-request.dto';
import { UsersService } from '../../users/users.service';
import { AccountLinkingExceptionFilter } from './oidc/account-linking.exception-filter';
import { getRedirectToFromRequest } from './oidc/oidc-cookie-state-store';
import { CookieConfigService } from '../../../common/services/cookie-config.service';
import { ApiBadRequestResponse } from '@nestjs/swagger';
import { SSOSamlGuard } from './saml/saml.guard';
import { SettingsService } from '../../../settings/settings.service';
import { SSOLinkTokenService } from './link-token.service';
import { timingSafeEqual } from 'crypto';
import { SSOProvisioningPermissionsDto, SSOProvisioningUserDto } from './dto/sso-provisioning.dto';
import { InvalidSSOProviderIdException, SSOProviderNotFoundException } from './errors';
import { resolvePermissionsFromRoles } from './permission-mapping';
@ApiTags('Authentication')
@Controller('auth/sso')
export class SSOController {
  private readonly logger = new Logger(SSOController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly usersService: UsersService,
    private readonly ssoService: SSOService,
    private readonly cookieConfigService: CookieConfigService,
    private readonly linkTokenService: SSOLinkTokenService,
    private readonly settingsService: SettingsService,
  ) {}

  @Get('providers')
  @ApiOperation({ summary: 'Get all SSO providers', operationId: 'getAllSSOProviders' })
  @ApiResponse({
    status: 200,
    description: 'The list of SSO providers',
    type: SSOProvider,
    isArray: true,
  })
  async getAll(): Promise<SSOProvider[]> {
    return this.ssoService.getAllProviders();
  }

  @Post('/link-account')
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
  public async linkUserToExternalAccount(@Body() body: LinkUserToExternalAccountRequestDto): Promise<{ OK: boolean }> {
    const linkPayload = await this.linkTokenService.verify(body.linkToken);
    const user = await this.usersService.findOne({ email: linkPayload.email }, ['authenticationDetails']);
    if (!user) {
      throw new UnauthorizedException();
    }

    const hasSSO = await this.authService.userHasSSOAuthentication(user.id);
    if (hasSSO) {
      throw new BadRequestException('SSO_ALREADY_LINKED');
    }

    const localAuth = user.authenticationDetails?.find((detail) => detail.type === AuthenticationType.LOCAL_PASSWORD);
    if (!localAuth) {
      throw new BadRequestException('PASSWORD_REQUIRED');
    }

    const isAuthenticated = await this.authService.validateAuthenticationDetails(user.id, {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: {
        password: body.password,
      },
    });

    if (!isAuthenticated) {
      throw new UnauthorizedException();
    }

    const existingSSOUserId = await this.authService.findUserIdBySSO(
      linkPayload.providerType,
      linkPayload.providerId,
      linkPayload.ssoSubject,
    );
    if (existingSSOUserId && existingSSOUserId !== user.id) {
      throw new BadRequestException('SSO_SUBJECT_ALREADY_LINKED');
    }

    await this.authService.addAuthenticationDetails(user.id, {
      type: AuthenticationType.SSO,
      details: {
        providerType: linkPayload.providerType,
        providerId: linkPayload.providerId,
        subject: linkPayload.ssoSubject,
      },
    });

    // Remove local password to enforce SSO-only after linking
    await this.authService.removeAuthenticationDetails(localAuth.id);
    await this.usersService.updateOne(user.id, { externalIdentifier: null });

    return { OK: true };
  }

  @Get('providers/:id')
  @Auth('canManageSystemConfiguration')
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
    const providerId = parseInt(id, 10);
    const provider = await this.ssoService.getProviderById(providerId);
    const withConfig = await this.ssoService.getProviderByTypeAndIdWithConfiguration(
      provider.type,
      providerId
    );
    if (!withConfig) throw new SSOProviderNotFoundException();
    return withConfig;
  }

  @Post('providers')
  @Auth('canManageSystemConfiguration')
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
  async createOne(@Body() createDto: CreateSSOProviderDto): Promise<SSOProvider> {
    return this.ssoService.createProvider(createDto);
  }

  @Put('providers/:id')
  @Auth('canManageSystemConfiguration')
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
  async updateOne(@Param('id') id: string, @Body() updateDto: UpdateSSOProviderDto): Promise<SSOProvider> {
    return this.ssoService.updateProvider(parseInt(id, 10), updateDto);
  }

  @Delete('providers/:id')
  @Auth('canManageSystemConfiguration')
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
  async deleteOne(@Param('id') id: string): Promise<void> {
    return this.ssoService.deleteProvider(parseInt(id, 10));
  }

  @Get('discovery/authentik')
  @Auth('canManageSystemConfiguration')
  @ApiOperation({ summary: 'Proxy Authentik OIDC well-known discovery', operationId: 'discoverAuthentikOidc' })
  @ApiQuery({ name: 'host', required: true, description: 'Authentik host, e.g. http://localhost:9000' })
  @ApiQuery({ name: 'applicationName', required: true, description: 'Authentik application slug' })
  @ApiResponse({ status: 200, description: 'OIDC configuration JSON' })
  @ApiBadRequestResponse({ description: 'Invalid host or applicationName' })
  async discoverAuthentik(@Query('host') host: string, @Query('applicationName') applicationName: string) {
    if (!host || !applicationName) {
      throw new BadRequestException('Missing required parameters');
    }

    const trimmedHost = host.endsWith('/') ? host.slice(0, -1) : host;
    const hasProtocol = /^https?:\/\//i.test(trimmedHost);
    const origin = hasProtocol ? trimmedHost : `http://${trimmedHost}`;
    const targetUrl = `${origin}/application/o/${encodeURIComponent(applicationName)}/.well-known/openid-configuration`;

    const response = await fetch(targetUrl, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new UnauthorizedException(`Failed to fetch discovery: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  @Get('discovery/keycloak')
  @Auth('canManageSystemConfiguration')
  @ApiOperation({ summary: 'Proxy Keycloak OIDC well-known discovery', operationId: 'discoverKeycloakOidc' })
  @ApiQuery({ name: 'host', required: true, description: 'Keycloak host, e.g. http://localhost:8080' })
  @ApiQuery({ name: 'realm', required: true, description: 'Keycloak realm name' })
  @ApiResponse({ status: 200, description: 'OIDC configuration JSON' })
  @ApiBadRequestResponse({ description: 'Invalid host or realm' })
  async discoverKeycloak(@Query('host') host: string, @Query('realm') realm: string) {
    if (!host || !realm) {
      throw new BadRequestException('Missing required parameters');
    }

    const trimmedHost = host.endsWith('/') ? host.slice(0, -1) : host;
    const hasProtocol = /^https?:\/\//i.test(trimmedHost);
    const origin = hasProtocol ? trimmedHost : `http://${trimmedHost}`;
    const targetUrl = `${origin}/realms/${encodeURIComponent(realm)}/.well-known/openid-configuration`;

    const response = await fetch(targetUrl, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new UnauthorizedException(`Failed to fetch discovery: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  @Post(`/${SSOProviderType.OIDC}/:providerId/logout`)
  @ApiOperation({ summary: 'SSO-initiated logout', operationId: 'ssoOidcLogout' })
  @ApiParam({
    name: 'providerId',
    type: 'string',
    description: 'The ID of the SSO provider',
  })
  @ApiHeader({
    name: 'Authorization',
    required: false,
    description: 'Bearer <SSO client secret> (or use x-api-key)',
  })
  @ApiHeader({
    name: 'x-api-key',
    required: false,
    description: 'SSO client secret (alternative to Authorization header)',
  })
  @ApiBody({ type: SSOProvisioningUserDto })
  @ApiResponse({
    status: 200,
    description: 'All user sessions have been revoked',
    schema: {
      type: 'object',
      properties: {
        OK: { type: 'boolean' },
      },
    },
  })
  async oidcLogout(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningUserDto,
  ): Promise<{ OK: boolean }> {
    const parsedProviderId = this.parseProviderId(providerId);
    const provider = await this.loadProvisioningProvider(SSOProviderType.OIDC, parsedProviderId);
    this.assertProvisioningAuthorized(provider, request);

    const user = await this.resolveProvisioningUser(SSOProviderType.OIDC, parsedProviderId, body);
    await this.sessionService.revokeAllUserSessions(user.id);

    return { OK: true };
  }

  @Post(`/${SSOProviderType.SAML}/:providerId/logout`)
  @ApiOperation({ summary: 'SAML-initiated logout', operationId: 'ssoSamlLogout' })
  @ApiParam({
    name: 'providerId',
    type: 'string',
    description: 'The ID of the SSO provider',
  })
  @ApiHeader({
    name: 'Authorization',
    required: false,
    description: 'Bearer <SSO provisioning secret> (or use x-api-key)',
  })
  @ApiHeader({
    name: 'x-api-key',
    required: false,
    description: 'SSO provisioning secret (alternative to Authorization header)',
  })
  @ApiBody({ type: SSOProvisioningUserDto })
  @ApiResponse({
    status: 200,
    description: 'All user sessions have been revoked',
    schema: {
      type: 'object',
      properties: {
        OK: { type: 'boolean' },
      },
    },
  })
  async samlLogout(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningUserDto,
  ): Promise<{ OK: boolean }> {
    const parsedProviderId = this.parseProviderId(providerId);
    const provider = await this.loadProvisioningProvider(SSOProviderType.SAML, parsedProviderId);
    this.assertProvisioningAuthorized(provider, request);

    const user = await this.resolveProvisioningUser(SSOProviderType.SAML, parsedProviderId, body);
    await this.sessionService.revokeAllUserSessions(user.id);

    return { OK: true };
  }

  @Post(`/${SSOProviderType.OIDC}/:providerId/users/delete`)
  @ApiOperation({ summary: 'SSO-initiated user deletion', operationId: 'ssoOidcDeleteUser' })
  @ApiParam({
    name: 'providerId',
    type: 'string',
    description: 'The ID of the SSO provider',
  })
  @ApiHeader({
    name: 'Authorization',
    required: false,
    description: 'Bearer <SSO client secret> (or use x-api-key)',
  })
  @ApiHeader({
    name: 'x-api-key',
    required: false,
    description: 'SSO client secret (alternative to Authorization header)',
  })
  @ApiBody({ type: SSOProvisioningUserDto })
  @ApiResponse({
    status: 200,
    description: 'The user has been deleted',
    schema: {
      type: 'object',
      properties: {
        OK: { type: 'boolean' },
      },
    },
  })
  async oidcDeleteUser(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningUserDto,
  ): Promise<{ OK: boolean }> {
    const parsedProviderId = this.parseProviderId(providerId);
    const provider = await this.loadProvisioningProvider(SSOProviderType.OIDC, parsedProviderId);
    this.assertProvisioningAuthorized(provider, request);

    const user = await this.resolveProvisioningUser(SSOProviderType.OIDC, parsedProviderId, body);
    await this.usersService.deleteOne(user.id);

    return { OK: true };
  }

  @Post(`/${SSOProviderType.SAML}/:providerId/users/delete`)
  @ApiOperation({ summary: 'SAML-initiated user deletion', operationId: 'ssoSamlDeleteUser' })
  @ApiParam({
    name: 'providerId',
    type: 'string',
    description: 'The ID of the SSO provider',
  })
  @ApiHeader({
    name: 'Authorization',
    required: false,
    description: 'Bearer <SSO provisioning secret> (or use x-api-key)',
  })
  @ApiHeader({
    name: 'x-api-key',
    required: false,
    description: 'SSO provisioning secret (alternative to Authorization header)',
  })
  @ApiBody({ type: SSOProvisioningUserDto })
  @ApiResponse({
    status: 200,
    description: 'The user has been deleted',
    schema: {
      type: 'object',
      properties: {
        OK: { type: 'boolean' },
      },
    },
  })
  async samlDeleteUser(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningUserDto,
  ): Promise<{ OK: boolean }> {
    const parsedProviderId = this.parseProviderId(providerId);
    const provider = await this.loadProvisioningProvider(SSOProviderType.SAML, parsedProviderId);
    this.assertProvisioningAuthorized(provider, request);

    const user = await this.resolveProvisioningUser(SSOProviderType.SAML, parsedProviderId, body);
    await this.usersService.deleteOne(user.id);

    return { OK: true };
  }

  @Post(`/${SSOProviderType.OIDC}/:providerId/users/permissions`)
  @ApiOperation({ summary: 'SSO-initiated permission update', operationId: 'ssoOidcUpdatePermissions' })
  @ApiParam({
    name: 'providerId',
    type: 'string',
    description: 'The ID of the SSO provider',
  })
  @ApiHeader({
    name: 'Authorization',
    required: false,
    description: 'Bearer <SSO client secret> (or use x-api-key)',
  })
  @ApiHeader({
    name: 'x-api-key',
    required: false,
    description: 'SSO client secret (alternative to Authorization header)',
  })
  @ApiBody({ type: SSOProvisioningPermissionsDto })
  @ApiResponse({
    status: 200,
    description: 'The user permissions have been updated',
    schema: {
      type: 'object',
      properties: {
        OK: { type: 'boolean' },
      },
    },
  })
  async oidcUpdatePermissions(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningPermissionsDto,
  ): Promise<{ OK: boolean }> {
    const parsedProviderId = this.parseProviderId(providerId);
    const provider = await this.loadProvisioningProvider(SSOProviderType.OIDC, parsedProviderId);
    this.assertProvisioningAuthorized(provider, request);

    const user = await this.resolveProvisioningUser(SSOProviderType.OIDC, parsedProviderId, body);
    const updates = this.buildPermissionUpdates(provider, body);
    if (Object.keys(updates).length > 0) {
      const mergedPermissions = { ...(user.systemPermissions ?? {}), ...updates };
      await this.usersService.updateOne(user.id, { systemPermissions: mergedPermissions });
    }

    return { OK: true };
  }

  @Post(`/${SSOProviderType.SAML}/:providerId/users/permissions`)
  @ApiOperation({ summary: 'SAML-initiated permission update', operationId: 'ssoSamlUpdatePermissions' })
  @ApiParam({
    name: 'providerId',
    type: 'string',
    description: 'The ID of the SSO provider',
  })
  @ApiHeader({
    name: 'Authorization',
    required: false,
    description: 'Bearer <SSO provisioning secret> (or use x-api-key)',
  })
  @ApiHeader({
    name: 'x-api-key',
    required: false,
    description: 'SSO provisioning secret (alternative to Authorization header)',
  })
  @ApiBody({ type: SSOProvisioningPermissionsDto })
  @ApiResponse({
    status: 200,
    description: 'The user permissions have been updated',
    schema: {
      type: 'object',
      properties: {
        OK: { type: 'boolean' },
      },
    },
  })
  async samlUpdatePermissions(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningPermissionsDto,
  ): Promise<{ OK: boolean }> {
    const parsedProviderId = this.parseProviderId(providerId);
    const provider = await this.loadProvisioningProvider(SSOProviderType.SAML, parsedProviderId);
    this.assertProvisioningAuthorized(provider, request);

    const user = await this.resolveProvisioningUser(SSOProviderType.SAML, parsedProviderId, body);
    const updates = this.buildPermissionUpdates(provider, body);
    if (Object.keys(updates).length > 0) {
      const mergedPermissions = { ...(user.systemPermissions ?? {}), ...updates };
      await this.usersService.updateOne(user.id, { systemPermissions: mergedPermissions });
    }

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
  @UseGuards(SSOOIDCGuard, AuthGuard('sso-oidc'))
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
  @UseGuards(SSOOIDCGuard, AuthGuard('sso-oidc'))
  @UseFilters(AccountLinkingExceptionFilter)
  async oidcLoginCallback(
    @Req() request: AuthenticatedRequest,
    @Query('redirectTo') redirectToQuery: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreateSessionResponse | void> {
    const redirectTo = getRedirectToFromRequest(
      request as unknown as Record<string, unknown>,
      redirectToQuery,
    );
    return this.finalizeLogin(request, response, redirectTo);
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
  @UseGuards(SSOSamlGuard, AuthGuard('sso-saml'))
  async loginWithSaml(): Promise<HttpStatus.OK> {
    return HttpStatus.OK;
  }

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
  @UseGuards(SSOSamlGuard, AuthGuard('sso-saml'))
  @UseFilters(AccountLinkingExceptionFilter)
  async samlLoginCallback(
    @Req() request: AuthenticatedRequest,
    @Query('redirectTo') redirectTo: string,
    @Body('RelayState') relayState: string,
    @Query('RelayState') relayStateQuery: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreateSessionResponse | void> {
    const defaultRedirect = await this.settingsService.getUrl();
    const target = redirectTo || relayState || relayStateQuery || defaultRedirect;
    return this.finalizeLogin(request, response, target);
  }

  private async finalizeLogin(
    request: AuthenticatedRequest,
    response: Response,
    redirectTo?: string,
  ): Promise<CreateSessionResponse | void> {
    const sessionToken = await this.sessionService.createSession(request.user, {
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip || request.connection.remoteAddress,
    });

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

  private parseProviderId(rawProviderId: string): number {
    const providerId = parseInt(rawProviderId, 10);
    if (Number.isNaN(providerId)) {
      throw new InvalidSSOProviderIdException();
    }
    return providerId;
  }

  private extractProvisioningToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.substring(7).trim();
    }

    const apiKeyHeader = request.headers['x-api-key'];
    if (Array.isArray(apiKeyHeader)) {
      return apiKeyHeader.length > 0 ? apiKeyHeader[0].trim() : null;
    }
    if (typeof apiKeyHeader === 'string') {
      return apiKeyHeader.trim();
    }

    return null;
  }

  private assertProvisioningAuthorized(provider: SSOProvider, request: Request): void {
    const secret =
      provider.type === SSOProviderType.SAML
        ? provider.samlConfiguration?.provisioningSecret
        : provider.oidcConfiguration?.clientSecret;
    if (!secret) {
      throw new UnauthorizedException('SSO_CLIENT_SECRET_NOT_CONFIGURED');
    }

    const provided = this.extractProvisioningToken(request);
    if (!provided) {
      throw new UnauthorizedException('SSO_PROVISIONING_TOKEN_REQUIRED');
    }

    const expectedBuffer = Buffer.from(secret);
    const actualBuffer = Buffer.from(provided);
    if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
      throw new UnauthorizedException('SSO_PROVISIONING_UNAUTHORIZED');
    }
  }

  private async loadProvisioningProvider(type: SSOProviderType, providerId: number): Promise<SSOProvider> {
    const provider = await this.ssoService.getProviderByTypeAndIdWithConfiguration(type, providerId);
    if (!provider) {
      throw new SSOProviderNotFoundException();
    }

    if (type === SSOProviderType.OIDC && !provider.oidcConfiguration) {
      throw new SSOProviderNotFoundException();
    }
    if (type === SSOProviderType.SAML && !provider.samlConfiguration) {
      throw new SSOProviderNotFoundException();
    }

    return provider;
  }

  private async resolveProvisioningUser(
    providerType: SSOProviderType,
    providerId: number,
    payload: SSOProvisioningUserDto,
  ) {
    const subject = payload.subject?.trim();
    const email = payload.email?.trim();

    if (!subject && !email) {
      throw new BadRequestException('SSO_SUBJECT_OR_EMAIL_REQUIRED');
    }

    let user =
      subject && providerType === SSOProviderType.SAML
        ? await this.usersService.findOne({ externalIdentifier: subject })
        : subject
          ? await this.usersService.findOneBySSO(providerType, providerId, subject)
          : null;

    if (!user && email) {
      user = await this.usersService.findOne({ email }, ['authenticationDetails']);
      if (user) {
        if (providerType === SSOProviderType.SAML) {
          if (!user.externalIdentifier) {
            user = null;
          }
        } else {
          const isMatchingProvider = user.authenticationDetails?.some(
            (detail) =>
              detail.type === AuthenticationType.SSO &&
              detail.providerType === providerType &&
              detail.providerId === providerId,
          );
          if (!isMatchingProvider) {
            user = null;
          }
        }
      }
    }

    if (!user) {
      throw new NotFoundException('SSO_USER_NOT_FOUND');
    }

    return user;
  }

  private extractPermissionUpdates(payload: SSOProvisioningPermissionsDto): Partial<SystemPermissions> {
    const updates: Partial<SystemPermissions> = {};

    if (payload.canManageResources !== undefined) {
      updates.canManageResources = payload.canManageResources;
    }
    if (payload.canManageSystemConfiguration !== undefined) {
      updates.canManageSystemConfiguration = payload.canManageSystemConfiguration;
    }
    if (payload.canManageUsers !== undefined) {
      updates.canManageUsers = payload.canManageUsers;
    }
    if (payload.canManageBilling !== undefined) {
      updates.canManageBilling = payload.canManageBilling;
    }

    return updates as {
      canManageResources?: boolean;
      canManageSystemConfiguration?: boolean;
      canManageUsers?: boolean;
      canManageBilling?: boolean;
    };
  }

  private buildPermissionUpdates(
    provider: SSOProvider,
    payload: SSOProvisioningPermissionsDto,
  ): Partial<SystemPermissions> {
    const updates = this.extractPermissionUpdates(payload);
    const roleNames = payload.roles?.map((role) => role.trim()).filter((role) => role.length > 0) ?? [];
    if (roleNames.length === 0) {
      return updates;
    }

    const mapping =
      provider.type === SSOProviderType.OIDC
        ? provider.oidcConfiguration?.permissionMappings
        : provider.samlConfiguration?.permissionMappings;
    const roleUpdates = resolvePermissionsFromRoles(roleNames, mapping);

    return {
      ...roleUpdates,
      ...updates,
    };
  }
}
