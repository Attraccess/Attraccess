import { SSOProviderType } from '@attraccess/database-entities';
import { Body, Param, Post, Req } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { SSOProvisioningPermissionsDto, SSOProvisioningUserDto } from './dto/sso-provisioning.dto';
import { SsoRevocationRoutesImplementation } from './sso-revocation.routes';
export abstract class SsoProvisioningRoutesImplementation extends SsoRevocationRoutesImplementation {
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
}
