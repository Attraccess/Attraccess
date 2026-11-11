import { AllowCrossSiteWrite } from '../../../../common/security/cross-site-write.guard';
import { SsoSessionRequest } from '../sso-session-request';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';

import { Response, Request } from 'express';

import { auditActorOf } from '../../../../audit/recorder/audit-event';

import { CreateSessionResponse } from '../../auth.types';

import { SSOProviderType } from '@attraccess/database-entities';

import { Body, Param, Post, Req } from '@nestjs/common';

import { ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

import { SSOProvisioningPermissionsDto, SSOProvisioningUserDto } from '../dto/sso-provisioning.dto';

import { SsoProviderRoutes } from '../providers/provider-routes';

export abstract class SsoUserProvisioning extends SsoProviderRoutes {
  protected async finalizeLogin(
    request: AuthenticatedRequest,
    response: Response,
    redirectTo?: string,
    providerId?: number,
  ): Promise<CreateSessionResponse | void> {
    const metadata = {
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip || request.connection.remoteAddress,
      ssoContext: (request as unknown as SsoSessionRequest).ssoSessionContext,
    };
    const origin = {
      actor: auditActorOf(request.user),
      request: { ipAddress: metadata.ipAddress, userAgent: metadata.userAgent },
    };
    const sessionToken = await this.sessionService.createSsoSession(request.user, metadata, origin, providerId);

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

  @AllowCrossSiteWrite()
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
  @ApiResponse({ status: 401, description: 'Missing or wrong provisioning secret, or no secret configured' })
  @ApiResponse({ status: 429, description: 'Too many failed secret checks from this IP for this provider' })
  async samlDeleteUser(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningUserDto,
  ): Promise<{ OK: boolean }> {
    const parsedProviderId = this.parseProviderId(providerId);
    const provider = await this.loadProvisioningProvider(SSOProviderType.SAML, parsedProviderId);
    await this.authorizeProvisioning(provider, request);

    const user = await this.resolveProvisioningUser(SSOProviderType.SAML, parsedProviderId, body);
    await this.provisioning.deleteUser(provider, user.id);

    return { OK: true };
  }

  @AllowCrossSiteWrite()
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
  @ApiResponse({ status: 401, description: 'Missing or wrong provisioning secret, or no secret configured' })
  @ApiResponse({ status: 429, description: 'Too many failed secret checks from this IP for this provider' })
  async oidcUpdatePermissions(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningPermissionsDto,
  ): Promise<{ OK: boolean }> {
    const parsedProviderId = this.parseProviderId(providerId);
    const provider = await this.loadProvisioningProvider(SSOProviderType.OIDC, parsedProviderId);
    await this.authorizeProvisioning(provider, request);

    const user = await this.resolveProvisioningUser(SSOProviderType.OIDC, parsedProviderId, body);
    await this.provisioning.syncPermissions(provider, user.id, body);

    return { OK: true };
  }

  @AllowCrossSiteWrite()
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
  @ApiResponse({ status: 401, description: 'Missing or wrong provisioning secret, or no secret configured' })
  @ApiResponse({ status: 429, description: 'Too many failed secret checks from this IP for this provider' })
  async samlUpdatePermissions(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningPermissionsDto,
  ): Promise<{ OK: boolean }> {
    const parsedProviderId = this.parseProviderId(providerId);
    const provider = await this.loadProvisioningProvider(SSOProviderType.SAML, parsedProviderId);
    await this.authorizeProvisioning(provider, request);

    const user = await this.resolveProvisioningUser(SSOProviderType.SAML, parsedProviderId, body);
    await this.provisioning.syncPermissions(provider, user.id, body);

    return { OK: true };
  }

  @AllowCrossSiteWrite()
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
  @ApiResponse({ status: 401, description: 'Missing or wrong provisioning secret, or no secret configured' })
  @ApiResponse({ status: 429, description: 'Too many failed secret checks from this IP for this provider' })
  async oidcLogout(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningUserDto,
  ): Promise<{ OK: boolean }> {
    const parsedProviderId = this.parseProviderId(providerId);
    const provider = await this.loadProvisioningProvider(SSOProviderType.OIDC, parsedProviderId);
    await this.authorizeProvisioning(provider, request);

    const user = await this.resolveProvisioningUser(SSOProviderType.OIDC, parsedProviderId, body);
    await this.provisioning.revokeSessions(provider, user.id);

    return { OK: true };
  }

  @AllowCrossSiteWrite()
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
  @ApiResponse({ status: 401, description: 'Missing or wrong provisioning secret, or no secret configured' })
  @ApiResponse({ status: 429, description: 'Too many failed secret checks from this IP for this provider' })
  async samlLogout(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningUserDto,
  ): Promise<{ OK: boolean }> {
    const parsedProviderId = this.parseProviderId(providerId);
    const provider = await this.loadProvisioningProvider(SSOProviderType.SAML, parsedProviderId);
    await this.authorizeProvisioning(provider, request);

    const user = await this.resolveProvisioningUser(SSOProviderType.SAML, parsedProviderId, body);
    await this.provisioning.revokeSessions(provider, user.id);

    return { OK: true };
  }

  @AllowCrossSiteWrite()
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
  @ApiResponse({ status: 401, description: 'Missing or wrong provisioning secret, or no secret configured' })
  @ApiResponse({ status: 429, description: 'Too many failed secret checks from this IP for this provider' })
  async oidcDeleteUser(
    @Param('providerId') providerId: string,
    @Req() request: Request,
    @Body() body: SSOProvisioningUserDto,
  ): Promise<{ OK: boolean }> {
    const parsedProviderId = this.parseProviderId(providerId);
    const provider = await this.loadProvisioningProvider(SSOProviderType.OIDC, parsedProviderId);
    await this.authorizeProvisioning(provider, request);

    const user = await this.resolveProvisioningUser(SSOProviderType.OIDC, parsedProviderId, body);
    await this.provisioning.deleteUser(provider, user.id);

    return { OK: true };
  }
}
