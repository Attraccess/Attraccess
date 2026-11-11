import { isDeepStrictEqual } from 'node:util';

import { SSOProvider, SSOProviderType } from '@attraccess/database-entities';

import { Auth, AuthenticatedRequest, AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import {
  BadRequestException,
  Body,
  Get,
  Post,
  Query,
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

import { CookieConfigService } from '../../../../common/services/cookie-config.service';

import { MetricsService } from '../../../../metrics/metrics.service';

import { SettingsService } from '../../../../settings/settings.service';

import { RbacService } from '../../../rbac/rbac.service';

import { UsersService } from '../../../users/users.service';

import { CreateSessionResponse } from '../../auth.types';

import { SessionService } from '../../session.service';

import { resolveIp, setRetryAfter } from '../../../rate-limiting/login.rate-limit.guard';

import { SSOProvisioningUserDto } from '../dto/sso-provisioning.dto';

import { SSOService } from '../sso.service';
import { SsoAccountLinkService } from '../sso-account-link.service';
import { SsoProvisioningService } from '../provisioning/sso-provisioning.service';
import { auditActorOf } from '../../../../audit/recorder/audit-event';
import { discoveryPathSegment, discoveryUrl, requestDiscoveryJson } from './discovery-client';

/** Null, undefined and an empty list all mean "defaults"; returns the list only when custom paths are set. */
function customRolePaths(value: string[] | null | undefined): string[] | null {
  return value && value.length > 0 ? value : null;
}

/** An omitted field means "unchanged"; otherwise compare entry by entry against the stored value. */
function sameRolePaths(incoming: string[] | null | undefined, stored: string[] | null | undefined): boolean {
  return incoming === undefined || isDeepStrictEqual(customRolePaths(incoming), customRolePaths(stored));
}

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
  @ApiResponse({ status: 401, description: 'Invalid, expired, used or exhausted link token, or wrong password' })
  @ApiResponse({ status: 423, description: 'The account is locked after too many failed attempts' })
  @ApiResponse({ status: 429, description: 'Too many attempts from this IP address' })
  public async linkUserToExternalAccount(
    @Body() body: LinkUserToExternalAccountRequestDto,
    @Req() request: Request,
  ): Promise<{ OK: boolean }> {
    const ip = resolveIp(request);
    try {
      // A throttled IP is refused before any token work, so garbage tokens do not bypass the limit.
      await this.accountLinks.assertIpAllowed(ip, null);
      return await this.accountLinks.link(body, ip);
    } catch (error) {
      setRetryAfter(request.res as Response, error);
      throw error;
    }
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

  private assertCanManageSsoRoles(request: AuthenticatedRequest, setting: string): void {
    if (!(request.user as AuthenticatedUser).effectivePermissions?.has('users.roles.manage')) {
      throw new ForbiddenException(`Configuring ${setting} requires users.roles.manage`);
    }
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
      this.assertCanManageSsoRoles(request, 'SSO role mappings');
      const actor = request.user as AuthenticatedUser;
      await this.assertPermissionMappingCeiling([oidcMappings, samlMappings], actor.effectivePermissions);
    }
    if (customRolePaths(createDto.oidcConfiguration?.roleClaimPaths)) {
      this.assertCanManageSsoRoles(request, 'SSO role claim paths');
    }
    if (customRolePaths(createDto.samlConfiguration?.roleAttributeKeys)) {
      this.assertCanManageSsoRoles(request, 'SSO role attribute keys');
    }
    return this.ssoService.createProvider(createDto, auditActorOf(request.user));
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
      this.assertCanManageSsoRoles(request, 'SSO role mappings');
      const actor = request.user as AuthenticatedUser;
      await this.assertPermissionMappingCeiling([oidcMappings, samlMappings], actor.effectivePermissions);
    }

    if (!sameRolePaths(updateDto.oidcConfiguration?.roleClaimPaths, before.oidcConfiguration?.roleClaimPaths)) {
      this.assertCanManageSsoRoles(request, 'SSO role claim paths');
    }
    if (!sameRolePaths(updateDto.samlConfiguration?.roleAttributeKeys, before.samlConfiguration?.roleAttributeKeys)) {
      this.assertCanManageSsoRoles(request, 'SSO role attribute keys');
    }

    return this.ssoService.updateProvider(providerId, updateDto, auditActorOf(request.user));
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
    await this.ssoService.deleteProvider(providerId, auditActorOf(request.user));
  }

  protected abstract readonly ssoService: SSOService;

  protected abstract readonly accountLinks: SsoAccountLinkService;

  protected abstract readonly provisioning: SsoProvisioningService;

  protected abstract assertPermissionMappingCeiling(
    mappings: Array<Record<string, string[]> | undefined>,
    actorPermissions: Set<string>,
  ): Promise<void>;

  protected abstract parseProviderId(rawProviderId: string): number;

  protected abstract loadProvisioningProvider(type: SSOProviderType, providerId: number): Promise<SSOProvider>;

  protected abstract authorizeProvisioning(provider: SSOProvider, request: Request): Promise<void>;

  protected abstract resolveProvisioningUser(
    providerType: SSOProviderType,
    providerId: number,
    payload: SSOProvisioningUserDto,
  ): Promise<import('@attraccess/database-entities').User>;

  protected abstract readonly sessionService: SessionService;

  protected abstract readonly metricsService: MetricsService;

  protected abstract finalizeLogin(
    request: AuthenticatedRequest,
    response: Response,
    redirectTo?: string,
    providerId?: number,
  ): Promise<CreateSessionResponse | void>;

  protected abstract readonly settingsService: SettingsService;

  protected abstract readonly cookieConfigService: CookieConfigService;

  protected abstract readonly logger: Logger;

  protected abstract extractProvisioningToken(request: Request): string | null;

  protected abstract readonly rbacService: RbacService;

  protected abstract readonly usersService: UsersService;
}
