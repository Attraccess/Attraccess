import { SSOProviderType } from '@attraccess/database-entities';
import { Body, Param, Post, Req } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { SSOProvisioningUserDto } from './dto/sso-provisioning.dto';
import { SsoDiscoveryRoutesImplementation } from './sso-discovery.routes';
export abstract class SsoRevocationRoutesImplementation extends SsoDiscoveryRoutesImplementation {
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
