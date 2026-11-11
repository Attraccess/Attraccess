import { AllowCrossSiteWrite } from '../../../common/security/cross-site-write.guard';
import {
  Controller,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Body,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';

import { CookieConfigService } from '../../../common/services/cookie-config.service';

import { LicenseModuleType } from '../../../license/license.service';

import { RequiresLicense } from '../../../license/require-license.decorator';

import { MetricsService } from '../../../metrics/metrics.service';

import { SettingsService } from '../../../settings/settings.service';

import { RbacService } from '../../rbac/rbac.service';

import { UsersService } from '../../users/users.service';

import { SessionService } from '../session.service';

import { SSOService } from './sso.service';

import { installInheritedMethods } from '../../../common/inherited-implementation';

import { SSOProvider, SSOProviderType, AuthenticationType } from '@attraccess/database-entities';

import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';

import { Request, Response } from 'express';

import { SSOProvisioningUserDto } from './dto/sso-provisioning.dto';

import { InvalidSSOProviderIdException, SSOProviderNotFoundException } from './errors';

import { CreateSessionResponse } from '../auth.types';

import { AccountLinkingExceptionFilter } from './oidc/account-linking.exception-filter';

import { getRedirectToFromRequest } from './oidc/oidc-cookie-state-store';

import { SSOOIDCPassportGuard } from './oidc/oidc-passport.guard';

import { SSOOIDCGuard } from './oidc/oidc.guard';

import { SSOSamlPassportGuard } from './saml/saml-passport.guard';

import { SSOSamlGuard } from './saml/saml.guard';

import { SsoUserProvisioning } from './provisioning/user-provisioning';

import { SsoProvisioningService } from './provisioning/sso-provisioning.service';

import { SsoAccountLinkService } from './sso-account-link.service';

import { resolveIp, setRetryAfter } from '../../rate-limiting/login.rate-limit.guard';

@ApiTags('Authentication')
@Controller('auth/sso')
@RequiresLicense(LicenseModuleType.SSO)
export class SSOController extends SsoUserProvisioning {
  constructor(
    protected readonly sessionService: SessionService,
    protected readonly usersService: UsersService,
    protected readonly ssoService: SSOService,
    protected readonly cookieConfigService: CookieConfigService,
    protected readonly settingsService: SettingsService,
    protected readonly metricsService: MetricsService,
    protected readonly rbacService: RbacService,
    protected readonly provisioning: SsoProvisioningService,
    protected readonly accountLinks: SsoAccountLinkService,
  ) {
    super();
  }

  protected readonly logger = new Logger(SSOController.name);

  // Per-role ceiling: each mapped role must have permissions that are a subset of the actor's own

  protected parseProviderId(rawProviderId: string): number {
    const providerId = parseInt(rawProviderId, 10);
    if (Number.isNaN(providerId)) {
      throw new InvalidSSOProviderIdException();
    }
    return providerId;
  }

  protected extractProvisioningToken(request: Request): string | null {
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

  /** The provisioning secret check; a throttled caller gets a Retry-After header. */
  protected async authorizeProvisioning(provider: SSOProvider, request: Request): Promise<void> {
    try {
      const ip = resolveIp(request);
      await this.provisioning.assertIpAllowed(provider, ip);
      await this.provisioning.verifySecret(provider, ip, this.extractProvisioningToken(request));
    } catch (error) {
      setRetryAfter(request.res as Response, error);
      throw error;
    }
  }

  protected async loadProvisioningProvider(type: SSOProviderType, providerId: number): Promise<SSOProvider> {
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

  protected async resolveProvisioningUser(
    providerType: SSOProviderType,
    providerId: number,
    payload: SSOProvisioningUserDto,
  ) {
    const subject = payload.subject?.trim();
    const email = payload.email?.trim();

    if (!subject && !email) {
      throw new BadRequestException('SSO_SUBJECT_OR_EMAIL_REQUIRED');
    }

    let user = subject ? await this.usersService.findOneBySSO(providerType, providerId, subject) : null;

    if (!user && email) {
      user = await this.usersService.findOne({ email }, ['authenticationDetails']);
      const isMatchingProvider = user?.authenticationDetails?.some(
        (detail) =>
          detail.type === AuthenticationType.SSO &&
          detail.providerType === providerType &&
          detail.providerId === providerId,
      );
      if (!isMatchingProvider) {
        user = null;
      }
    }

    if (!user) {
      throw new NotFoundException('SSO_USER_NOT_FOUND');
    }

    return user;
  }

  // Per-role ceiling: each mapped role must have permissions that are a subset of the actor's own
  protected async assertPermissionMappingCeiling(
    mappings: Array<Record<string, string[]> | undefined>,
    actorPermissions: Set<string>,
  ): Promise<void> {
    const roleKeys = new Set(mappings.flatMap((m) => Object.keys(m ?? {})));
    if (roleKeys.size === 0) return;

    const allRoles = await this.rbacService.getRoles();
    const roleByKey = new Map(allRoles.map((r) => [r.key, r]));

    for (const roleKey of roleKeys) {
      const role = roleByKey.get(roleKey);
      if (!role) {
        throw new ForbiddenException(`Cannot map unknown role '${roleKey}'`);
      }
      const missing = role.rolePermissions.map((rp) => rp.permissionKey).filter((k) => !actorPermissions.has(k));
      if (missing.length > 0) {
        throw new ForbiddenException(
          `Cannot map role '${roleKey}': it grants permissions you do not hold (${missing.join(', ')})`,
        );
      }
    }
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
    return this.finalizeLogin(request, response, redirectTo, providerId ? this.parseProviderId(providerId) : undefined);
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
    return this.finalizeLogin(request, response, target, providerId ? this.parseProviderId(providerId) : undefined);
  }
}

installInheritedMethods(SSOController, [
  'getAll',
  'linkUserToExternalAccount',
  'getOneById',
  'createOne',
  'updateOne',
  'deleteOne',
  'discoverAuthentik',
  'discoverKeycloak',
  'oidcLogout',
  'samlLogout',
  'oidcDeleteUser',
  'samlDeleteUser',
  'oidcUpdatePermissions',
  'samlUpdatePermissions',
  'loginWithOidc',
  'oidcLoginCallback',
  'loginWithSaml',
  'samlLoginCallback',
  'finalizeLogin',
  'parseProviderId',
  'extractProvisioningToken',
  'authorizeProvisioning',
  'loadProvisioningProvider',
  'resolveProvisioningUser',
  'assertPermissionMappingCeiling',
]);
