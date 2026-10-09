import { AuthenticationType, SSOProvider, SSOProviderType } from '@attraccess/database-entities';

import { Auth, AuthenticatedRequest, AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import {
  BadRequestException,
  Body,
  Get,
  Post,
  Query,
  UnauthorizedException,
  Delete,
  ForbiddenException,
  Param,
  Put,
  Req,
  Logger,
} from '@nestjs/common';

import { ApiBadRequestResponse, ApiOperation, ApiQuery, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';

import { SkipLicenseCheck } from '../../../../license/require-license.decorator';

import { LinkUserToExternalAccountRequestDto } from '../dto/link-user-to-external-account-request.dto';
import { CreateSSOProviderDto } from '../dto/create-sso-provider.dto';

import { UpdateSSOProviderDto } from '../dto/update-sso-provider.dto';

import { SSOProviderNotFoundException } from '../errors';

import { Request, Response } from 'express';

import { IdentityAuditService } from '../../../../audit/identity-audit.service';

import { SsoAuditService } from '../../../../audit/sso-audit.service';

import { CookieConfigService } from '../../../../common/services/cookie-config.service';

import { MetricsService } from '../../../../metrics/metrics.service';

import { SettingsService } from '../../../../settings/settings.service';

import { RbacService } from '../../../rbac/rbac.service';

import { UsersService } from '../../../users/users.service';

import { AuthService } from '../../auth.service';

import { CreateSessionResponse } from '../../auth.types';

import { SessionService } from '../../session.service';

import { SSOProvisioningPermissionsDto, SSOProvisioningUserDto } from '../dto/sso-provisioning.dto';

import { SSOLinkTokenService } from '../link-token.service';

import { SSOService } from '../sso.service';
import { discoveryPathSegment, discoveryUrl, requestDiscoveryJson } from './discovery-client';

// Private and loopback IdPs are supported. Metadata services and non-unicast
// destinations are not IdPs, including their IPv4-mapped IPv6 representations.
// Validate every answer before returning the exact list to the socket. Node can
// try alternate addresses without a second, unchecked DNS resolution.

export abstract class SsoProviderRoutes {
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
  public async linkUserToExternalAccount(@Body() body: LinkUserToExternalAccountRequestDto): Promise<{ OK: boolean }> {
    const linkPayload = await this.linkTokenService.verify(body.linkToken);
    const user = await this.usersService.findOne({ email: linkPayload.email }, ['authenticationDetails']);
    if (!user) {
      throw new UnauthorizedException();
    }

    const existingSSODetail = await this.authService.findSSOAuthenticationDetail(user.id);
    if (existingSSODetail && existingSSODetail.providerId !== linkPayload.providerId) {
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

    if (existingSSODetail) {
      await this.authService.updateSSOSubject(existingSSODetail.id, linkPayload.ssoSubject);
    } else {
      await this.authService.addAuthenticationDetails(user.id, {
        type: AuthenticationType.SSO,
        details: {
          providerType: linkPayload.providerType,
          providerId: linkPayload.providerId,
          subject: linkPayload.ssoSubject,
        },
      });
    }

    // Remove local password to enforce SSO-only after linking
    if (localAuth) {
      await this.authService.removeAuthenticationDetails(localAuth.id);
    }
    await this.usersService.updateOne(user.id, { externalIdentifier: null });

    return { OK: true };
  }

  @Get('discovery/authentik')
  @Auth('system.sso.manage')
  @ApiOperation({ summary: 'Proxy Authentik OIDC well-known discovery', operationId: 'discoverAuthentikOidc' })
  @ApiQuery({ name: 'host', required: true, description: 'Authentik host, e.g. http://localhost:9000' })
  @ApiQuery({ name: 'applicationName', required: true, description: 'Authentik application slug' })
  @ApiResponse({ status: 200, description: 'OIDC configuration JSON' })
  @ApiBadRequestResponse({ description: 'Invalid host or applicationName' })
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
  async discoverKeycloak(@Query('host') host: string, @Query('realm') realm: string) {
    if (typeof host !== 'string' || typeof realm !== 'string' || !host || !realm) {
      throw new BadRequestException('Missing required parameters');
    }

    const target = discoveryUrl(host, `/realms/${discoveryPathSegment(realm)}/.well-known/openid-configuration`);
    return requestDiscoveryJson(target);
  }

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
    return this.ssoService.getAllProviders();
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
    const providerId = parseInt(id, 10);
    const provider = await this.ssoService.getProviderById(providerId);
    const withConfig = await this.ssoService.getProviderByTypeAndIdWithConfiguration(provider.type, providerId);
    if (!withConfig) throw new SSOProviderNotFoundException();
    return withConfig;
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
    const oidcMappings = createDto.oidcConfiguration?.roleMappings;
    const samlMappings = createDto.samlConfiguration?.roleMappings;
    if (oidcMappings !== undefined || samlMappings !== undefined) {
      const actor = request.user as AuthenticatedUser;
      if (!actor.effectivePermissions?.has('users.roles.manage')) {
        throw new ForbiddenException('Configuring SSO role mappings requires users.roles.manage');
      }
      await this.assertPermissionMappingCeiling([oidcMappings, samlMappings], actor.effectivePermissions);
    }
    const provider = await this.ssoService.createProvider(createDto);
    await this.recordProviderAudit('created', request, provider);
    return provider;
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
    const providerId = parseInt(id, 10);
    const before = await this.ssoService.getProviderById(providerId);

    const oidcMappings = updateDto.oidcConfiguration?.roleMappings;
    const samlMappings = updateDto.samlConfiguration?.roleMappings;

    if (oidcMappings !== undefined || samlMappings !== undefined) {
      const actor = request.user as AuthenticatedUser;
      if (!actor.effectivePermissions?.has('users.roles.manage')) {
        throw new ForbiddenException('Configuring SSO role mappings requires users.roles.manage');
      }
      await this.assertPermissionMappingCeiling([oidcMappings, samlMappings], actor.effectivePermissions);
    }

    const provider = await this.ssoService.updateProvider(providerId, updateDto);
    await this.recordProviderAudit('updated', request, provider, before, this.providerRotationFlags(before, provider));
    return provider;
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
    const providerId = parseInt(id, 10);
    const provider = await this.ssoService.getProviderById(providerId);
    await this.ssoService.deleteProvider(providerId);
    await this.recordProviderAudit('deleted', request, provider);
  }

  protected abstract readonly ssoService: SSOService;

  protected abstract readonly linkTokenService: SSOLinkTokenService;

  protected abstract readonly usersService: UsersService;

  protected abstract readonly authService: AuthService;

  protected abstract assertPermissionMappingCeiling(
    mappings: Array<Record<string, string[]> | undefined>,
    actorPermissions: Set<string>,
  ): Promise<void>;

  protected abstract recordProviderAudit(
    action: 'created' | 'updated' | 'deleted',
    request: AuthenticatedRequest,
    provider: SSOProvider,
    before?: SSOProvider,
    rotated?: string[],
  ): Promise<void>;

  protected abstract providerRotationFlags(before: SSOProvider, after: SSOProvider): string[];

  protected abstract parseProviderId(rawProviderId: string): number;

  protected abstract loadProvisioningProvider(type: SSOProviderType, providerId: number): Promise<SSOProvider>;

  protected abstract assertProvisioningAuthorized(provider: SSOProvider, request: Request): void;

  protected abstract resolveProvisioningUser(
    providerType: SSOProviderType,
    providerId: number,
    payload: SSOProvisioningUserDto,
  ): Promise<import('@attraccess/database-entities').User>;

  protected abstract readonly sessionService: SessionService;

  protected abstract recordProvisioningAudit(
    action: 'sessions_revoked' | 'user_created' | 'user_deleted' | 'permissions_synced',
    provider: SSOProvider,
    userId: number,
    changes:
      | { sessionsRevoked: true }
      | { userCreated: true }
      | { userDeleted: true }
      | { added: string[]; removed: string[]; updated: string[] },
  ): Promise<void>;

  protected abstract applyProvisioningPermissions(
    userId: number,
    provider: SSOProvider,
    payload: SSOProvisioningPermissionsDto,
  ): Promise<{ added: string[]; removed: string[]; updated: string[] } | undefined>;

  protected abstract readonly metricsService: MetricsService;

  protected abstract finalizeLogin(
    request: AuthenticatedRequest,
    response: Response,
    redirectTo?: string,
    providerId?: number,
  ): Promise<CreateSessionResponse | void>;

  protected abstract readonly settingsService: SettingsService;

  protected abstract readonly cookieConfigService: CookieConfigService;

  protected abstract readonly identityAudit?: IdentityAuditService;

  protected abstract readonly logger: Logger;

  protected abstract extractProvisioningToken(request: Request): string | null;

  protected abstract readonly rbacService: RbacService;

  protected abstract providerSnapshot(provider: SSOProvider): string;

  protected abstract providerChanges(before: SSOProvider, after: SSOProvider, rotated: string[]): string;

  protected abstract recordSso(event: Parameters<SsoAuditService['record']>[0]): Promise<void>;

  protected abstract readonly ssoAudit?: SsoAuditService;
}
