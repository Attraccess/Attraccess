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
} from '@nestjs/common';
import { SSOOIDCGuard } from './oidc/oidc.guard';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticationType, SSOProvider, SSOProviderType } from '@attraccess/database-entities';
import { AuthenticatedRequest, Auth } from '@attraccess/plugins-backend-sdk';
import { CreateSessionResponse } from '../auth.types';
import { AuthService } from '../auth.service';
import { SessionService } from '../session.service';
import { SSOService } from './sso.service';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateSSOProviderDto } from './dto/create-sso-provider.dto';
import { UpdateSSOProviderDto } from './dto/update-sso-provider.dto';
import { Response } from 'express';
import { LinkUserToExternalAccountRequestDto } from './dto/link-user-to-external-account-request.dto';
import { UsersService } from '../../users/users.service';
import { AccountLinkingExceptionFilter } from './oidc/account-linking.exception-filter';
import { CookieConfigService } from '../../../common/services/cookie-config.service';
import { ApiBadRequestResponse } from '@nestjs/swagger';

@ApiTags('Authentication')
@Controller('auth/sso')
export class SSOController {
  private readonly logger = new Logger(SSOController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly usersService: UsersService,
    private readonly ssoService: SSOService,
    private readonly cookieConfigService: CookieConfigService
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
  @ApiOperation({ summary: 'Link an account to an external identifier', operationId: 'linkUserToExternalAccount' })
  @ApiResponse({
    status: 200,
    description: 'The account has been linked to the external identifier',
    schema: {
      type: 'object',
      properties: {
        OK: {
          type: 'boolean',
          description: 'Whether the account has been linked to the external identifier',
        },
      },
    },
  })
  public async linkUserToExternalAccount(@Body() body: LinkUserToExternalAccountRequestDto): Promise<{ OK: boolean }> {
    const user = await this.usersService.findOne({ email: body.email });

    if (!user) {
      throw new UnauthorizedException();
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

    await this.usersService.updateOne(user.id, { externalIdentifier: body.externalId });

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
    return this.ssoService.getProviderByTypeAndIdWithConfiguration(provider.type, providerId);
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
    @Query('redirectTo') redirectTo: string,
    @Res({ passthrough: true }) response: Response
  ): Promise<CreateSessionResponse | void> {
    // Create session token using SessionService
    const sessionToken = await this.sessionService.createSession(request.user, {
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip || request.connection.remoteAddress,
    });

    this.cookieConfigService.setAuthCookie(response, sessionToken);

    const auth: CreateSessionResponse = {
      user: request.user,
      authToken: sessionToken,
    };

    if (redirectTo) {
      const urlWithAuth = new URL(redirectTo);
      urlWithAuth.searchParams.delete('accountLinking');
      urlWithAuth.searchParams.delete('email');
      urlWithAuth.searchParams.delete('externalId');
      urlWithAuth.searchParams.delete('ssoProviderId');
      urlWithAuth.searchParams.delete('ssoProviderType');

      urlWithAuth.searchParams.set('user', JSON.stringify(auth.user));

      this.logger.debug('Redirecting to', urlWithAuth.toString());
      return response.redirect(urlWithAuth.toString());
    }

    return auth;
  }
}
