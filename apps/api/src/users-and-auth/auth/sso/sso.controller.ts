import {
  Controller,
  Logger,
  Optional,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
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

import { IdentityAuditService } from '../../../audit/identity-audit.service';

import { SsoAuditService } from '../../../audit/sso-audit.service';

import { CookieConfigService } from '../../../common/services/cookie-config.service';

import { LicenseModuleType } from '../../../license/license.service';

import { RequiresLicense } from '../../../license/require-license.decorator';

import { MetricsService } from '../../../metrics/metrics.service';

import { SettingsService } from '../../../settings/settings.service';

import { RbacService } from '../../rbac/rbac.service';

import { UsersService } from '../../users/users.service';

import { AuthService } from '../auth.service';

import { SessionService } from '../session.service';

import { SSOLinkTokenService } from './link-token.service';

import { SSOService } from './sso.service';

import { installInheritedMethods } from '../../../common/inherited-implementation';

import { SSOProvider, SSOProviderType, AuthenticationType } from '@attraccess/database-entities';

import { AuthenticatedRequest, AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import { randomUUID } from 'node:crypto';

import { isDeepStrictEqual } from 'node:util';

import { ssoAuditSnapshot } from './audit/provider-audit';

import { timingSafeEqual } from 'crypto';

import { Request, Response } from 'express';

import { SSOProvisioningPermissionsDto, SSOProvisioningUserDto } from './dto/sso-provisioning.dto';

import { InvalidSSOProviderIdException, SSOProviderNotFoundException } from './errors';

import { resolveSsoRoleAssignments } from './permission-mapping';

import { CreateSessionResponse } from '../auth.types';

import { AccountLinkingExceptionFilter } from './oidc/account-linking.exception-filter';

import { getRedirectToFromRequest } from './oidc/oidc-cookie-state-store';

import { SSOOIDCPassportGuard } from './oidc/oidc-passport.guard';

import { SSOOIDCGuard } from './oidc/oidc.guard';

import { SSOSamlPassportGuard } from './saml/saml-passport.guard';

import { SSOSamlGuard } from './saml/saml.guard';

import { SsoUserProvisioning } from './provisioning/user-provisioning';

@ApiTags('Authentication')
@Controller('auth/sso')
@RequiresLicense(LicenseModuleType.SSO)
export class SSOController extends SsoUserProvisioning {
  constructor(
    protected readonly authService: AuthService,
    protected readonly sessionService: SessionService,
    protected readonly usersService: UsersService,
    protected readonly ssoService: SSOService,
    protected readonly cookieConfigService: CookieConfigService,
    protected readonly linkTokenService: SSOLinkTokenService,
    protected readonly settingsService: SettingsService,
    protected readonly metricsService: MetricsService,
    protected readonly rbacService: RbacService,
    @Optional() protected readonly identityAudit?: IdentityAuditService,
    @Optional() protected readonly ssoAudit?: SsoAuditService,
  ) {
    super();
  }

  protected readonly logger = new Logger(SSOController.name);

  // Per-role ceiling: each mapped role must have permissions that are a subset of the actor's own

  protected async recordProviderAudit(
    action: 'created' | 'updated' | 'deleted',
    request: AuthenticatedRequest,
    provider: SSOProvider,
    before?: SSOProvider,
    rotated: string[] = [],
  ): Promise<void> {
    const actor = request.user as AuthenticatedUser;
    const snapshot = this.providerSnapshot(provider);
    const beforeSnapshot = this.providerSnapshot(before ?? provider);
    const changes = this.providerChanges(before ?? provider, provider, rotated);
    if (action === 'updated' && changes === '{"changed":[],"rotated":[]}') return;
    await this.recordSso({
      action: `sso.provider.${action}`,
      operationId: randomUUID(),
      actorId: actor.id,
      authenticationMethod: actor.authenticationMethod ?? 'session',
      ...(actor.authenticationMethod === 'api-token' && actor.apiTokenId ? { apiTokenId: actor.apiTokenId } : {}),
      subject: { type: 'sso.provider', id: provider.id },
      details:
        action === 'created'
          ? { before: 'null', after: snapshot }
          : action === 'deleted'
            ? { before: snapshot, after: 'null' }
            : { before: beforeSnapshot, after: snapshot, changes },
    });
  }

  protected async recordProvisioningAudit(
    action: 'sessions_revoked' | 'user_created' | 'user_deleted' | 'permissions_synced',
    provider: SSOProvider,
    userId: number,
    changes:
      | { sessionsRevoked: true }
      | { userCreated: true }
      | { userDeleted: true }
      | { added: string[]; removed: string[]; updated: string[] },
  ): Promise<void> {
    await this.recordSso({
      action: `sso.provisioning.${action}`,
      operationId: randomUUID(),
      actorId: null,
      authenticationMethod: null,
      subject: { type: 'user', id: userId },
      details: { provider: this.providerSnapshot(provider), changes: JSON.stringify(changes) },
    });
  }

  protected async recordSso(event: Parameters<SsoAuditService['record']>[0]): Promise<void> {
    try {
      await this.ssoAudit?.record(event);
    } catch {
      // Auditing must not roll back an already-completed SSO operation.
    }
  }

  protected providerSnapshot(provider: SSOProvider): string {
    return ssoAuditSnapshot(provider);
  }

  protected providerChanges(before: SSOProvider, after: SSOProvider, rotated: string[]): string {
    const beforeConfiguration = (before.type === SSOProviderType.OIDC
      ? before.oidcConfiguration
      : before.samlConfiguration) as unknown as Record<string, unknown> | undefined;
    const afterConfiguration = (after.type === SSOProviderType.OIDC
      ? after.oidcConfiguration
      : after.samlConfiguration) as unknown as Record<string, unknown> | undefined;
    const fields =
      before.type === SSOProviderType.OIDC
        ? [
            'issuer',
            'authorizationURL',
            'tokenURL',
            'userInfoURL',
            'clientId',
            'scopes',
            'usernameClaimPaths',
            'emailClaimPaths',
            'roleMappings',
          ]
        : [
            'entryPoint',
            'issuer',
            'audience',
            'signRequest',
            'wantAssertionsSigned',
            'wantAuthnResponseSigned',
            'forceAuthn',
            'emailAttributeKeys',
            'roleMappings',
          ];
    const changed = [
      ...(before.name === after.name ? [] : ['name']),
      ...fields
        .filter((key) => !isDeepStrictEqual(beforeConfiguration?.[key], afterConfiguration?.[key]))
        .map((key) => `configuration.${key}`),
    ];
    return JSON.stringify({ changed, rotated });
  }

  protected providerRotationFlags(before: SSOProvider, after: SSOProvider): string[] {
    const rotated: string[] = [];
    if (before.oidcConfiguration?.clientSecret !== after.oidcConfiguration?.clientSecret) rotated.push('clientSecret');
    if (before.samlConfiguration?.provisioningSecret !== after.samlConfiguration?.provisioningSecret)
      rotated.push('provisioningSecret');
    if (before.samlConfiguration?.certificate !== after.samlConfiguration?.certificate)
      rotated.push('identityProviderCertificate');
    if (before.samlConfiguration?.spSigningCertificate !== after.samlConfiguration?.spSigningCertificate)
      rotated.push('signingCertificate');
    if (before.samlConfiguration?.spSigningKeyEncrypted !== after.samlConfiguration?.spSigningKeyEncrypted)
      rotated.push('signingPrivateKey');
    return rotated;
  }

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

  protected assertProvisioningAuthorized(provider: SSOProvider, request: Request): void {
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

  protected async applyProvisioningPermissions(
    userId: number,
    provider: SSOProvider,
    payload: SSOProvisioningPermissionsDto,
  ): Promise<{ added: string[]; removed: string[]; updated: string[] } | undefined> {
    const mapping =
      provider.type === SSOProviderType.OIDC
        ? provider.oidcConfiguration?.roleMappings
        : provider.samlConfiguration?.roleMappings;

    // If the payload contains no `roles` field at all, treat as "no permission info" and skip
    // sync to avoid wiping SSO-granted roles on incremental provisioning calls.
    if (payload.roles === undefined) return undefined;

    const roleNames = payload.roles.map((r) => r.trim()).filter((r) => r.length > 0);
    const roleAssignments = resolveSsoRoleAssignments(roleNames, mapping);

    return this.rbacService.syncSsoRoles(userId, roleAssignments, provider.type, provider.id);
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
  'assertProvisioningAuthorized',
  'loadProvisioningProvider',
  'resolveProvisioningUser',
  'assertPermissionMappingCeiling',
  'applyProvisioningPermissions',
  'recordProviderAudit',
  'recordProvisioningAudit',
  'recordSso',
  'providerSnapshot',
  'providerChanges',
  'providerRotationFlags',
]);
