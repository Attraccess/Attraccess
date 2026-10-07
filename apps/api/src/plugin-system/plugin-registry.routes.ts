import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { auditSubjectKeyId, safeAuditOrigin } from '../audit/audit-administration-policy';
import { AddPluginRegistryDto } from './dto/npm-plugin-request.dto';
import { PluginControllerRouteContext } from './plugin.controller.route-context';
export abstract class PluginRegistryRoutesImplementation extends PluginControllerRouteContext {
  @Get('registries')
  @Auth('system.plugins.manage')
  listRegistries() {
    return this.npmPluginService.listRegistries();
  }

  @Post('registries')
  @Auth('system.plugins.manage')
  addRegistry(@Body() body: AddPluginRegistryDto, @Req() req: AuthenticatedRequest) {
    return this.npmPluginService.addRegistry(body).then(async (registry) => {
      await this.record(req, 'plugin.registry_added', auditSubjectKeyId(registry.id), 'plugin-registry', {
        registryId: registry.id,
        registryName: registry.name,
        registryUrl: safeAuditOrigin(registry.url),
      });
      return registry;
    });
  }

  @Post('registries/:registryId/test')
  @Auth('system.plugins.manage')
  async testRegistry(@Param('registryId') registryId: string, @Req() req: AuthenticatedRequest) {
    await this.npmPluginService.testRegistry(registryId);
    await this.record(req, 'plugin.registry_tested', auditSubjectKeyId(registryId), 'plugin-registry', { registryId });
    return { ok: true };
  }

  @Delete('registries/:registryId')
  @Auth('system.plugins.manage')
  removeRegistry(@Param('registryId') registryId: string, @Req() req: AuthenticatedRequest) {
    return this.npmPluginService.removeRegistry(registryId).then(async () => {
      await this.record(req, 'plugin.registry_removed', auditSubjectKeyId(registryId), 'plugin-registry', {
        registryId,
      });
    });
  }

  @Get('npm/:packageName/metadata')
  @Auth('system.plugins.manage')
  @ApiQuery({ name: 'registryId', required: false, type: String })
  packageMetadata(@Param('packageName') packageName: string, @Query('registryId') registryId?: string) {
    return this.npmPluginService.packageMetadata(packageName, registryId);
  }

  @Get('npm/:packageName/versions')
  @Auth('system.plugins.manage')
  @ApiQuery({ name: 'registryId', required: false, type: String })
  packageVersions(@Param('packageName') packageName: string, @Query('registryId') registryId?: string) {
    return this.npmPluginService.packageVersions(packageName, registryId);
  }

  @Get('marketplace/search')
  @Auth('system.plugins.manage')
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'registryId', required: false, type: String })
  searchMarketplace(@Query('query') query = '', @Query('registryId') registryId?: string) {
    return this.npmPluginService.searchMarketplace(query, registryId);
  }

  @Get('marketplace/:packageName')
  @Auth('system.plugins.manage')
  @ApiQuery({ name: 'registryId', required: false, type: String })
  marketplacePackage(@Param('packageName') packageName: string, @Query('registryId') registryId?: string) {
    return this.npmPluginService.marketplacePackage(packageName, registryId);
  }
}
