import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';

import { Response, Request } from 'express';

import { randomUUID } from 'node:crypto';

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
    const sessionToken = await this.sessionService.createSession(request.user, {
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip || request.connection.remoteAddress,
    });

    await this.cookieConfigService.setAuthCookie(response, sessionToken);
    if (providerId) {
      await this.identityAudit?.record({
        action: 'sso_login',
        operationId: randomUUID(),
        outcome: 'succeeded',
        actorId: request.user.id,
        authenticationMethod: request.user.authenticationMethod ?? 'session',
        apiTokenId: request.user.apiTokenId,
        subjectId: request.user.id,
        details: { providerId },
        request: {
          ipAddress: request.ip || request.connection.remoteAddress,
          userAgent: request.headers['user-agent'],
        },
      });
    }

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
    await this.recordProvisioningAudit('user_deleted', provider, user.id, { userDeleted: true });

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
    const changes = await this.applyProvisioningPermissions(user.id, provider, body);
    if (changes) await this.recordProvisioningAudit('permissions_synced', provider, user.id, changes);

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
    const changes = await this.applyProvisioningPermissions(user.id, provider, body);
    if (changes) await this.recordProvisioningAudit('permissions_synced', provider, user.id, changes);

    return { OK: true };
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
    await this.recordProvisioningAudit('sessions_revoked', provider, user.id, { sessionsRevoked: true });

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
    await this.recordProvisioningAudit('sessions_revoked', provider, user.id, { sessionsRevoked: true });

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
    await this.recordProvisioningAudit('user_deleted', provider, user.id, { userDeleted: true });

    return { OK: true };
  }
}
