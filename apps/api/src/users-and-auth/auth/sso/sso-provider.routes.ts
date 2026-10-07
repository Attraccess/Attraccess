import { SSOProvider } from '@attraccess/database-entities';
import { Auth, AuthenticatedRequest, AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { Body, Delete, ForbiddenException, Get, Param, Post, Put, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { SkipLicenseCheck } from '../../../license/require-license.decorator';
import { CreateSSOProviderDto } from './dto/create-sso-provider.dto';
import { UpdateSSOProviderDto } from './dto/update-sso-provider.dto';
import { SSOProviderNotFoundException } from './errors';
import { SSOControllerRouteContext } from './sso.controller.route-context';
export abstract class SsoProviderRoutesImplementation extends SSOControllerRouteContext {
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
}
