import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiQuery, ApiResponse } from '@nestjs/swagger';
import { InstallPluginDto, RemoveInstalledPluginDto } from './dto/npm-plugin-request.dto';
import { PluginDependencyPlanDto, PluginRemovalItemDto } from './dto/plugin-dependency-plan.dto';
import { PluginRegistryRoutesImplementation } from './plugin-registry.routes';
export abstract class PluginInstallRoutesImplementation extends PluginRegistryRoutesImplementation {
  @Get('npm/:packageName/plan')
  @ApiResponse({ status: 200, type: PluginDependencyPlanDto })
  @Auth('system.plugins.manage')
  @ApiQuery({ name: 'spec', required: false, type: String })
  @ApiQuery({ name: 'registryId', required: false, type: String })
  dependencyPlan(
    @Param('packageName') packageName: string,
    @Query('spec') spec = 'latest',
    @Query('registryId') registryId?: string,
  ) {
    return this.npmPluginService.installPlan(packageName, spec, registryId);
  }

  @Get('installed/:packageName/removal-plan')
  @ApiResponse({ status: 200, type: [PluginRemovalItemDto] })
  @Auth('system.plugins.manage')
  removalPlan(@Param('packageName') packageName: string) {
    return this.npmPluginService.removalPlan(packageName);
  }

  @Post('installed/:packageName/remove')
  @Auth('system.plugins.manage')
  async removePackageGraph(
    @Param('packageName') packageName: string,
    @Body() body: RemoveInstalledPluginDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const removing = this.npmPluginService.removalPlan(packageName);
    await this.npmPluginService.removeInstalled(packageName, Boolean(req), body.approvedDependants ?? []);
    for (const plugin of removing) await this.recordPackage(req, 'plugin.removed', plugin);
    if (req) this.pluginService.requestRestart();
    return { ok: true };
  }

  @Post('npm/:packageName/versions/:version')
  @Auth('system.plugins.manage')
  installPackage(
    @Param('packageName') packageName: string,
    @Param('version') version: string,
    @Body() body: InstallPluginDto,
    @Req() req?: AuthenticatedRequest,
  ) {
    return this.installWithAudit(req, 'plugin.installed', packageName, version, (state) =>
      this.npmPluginService.install(packageName, version, body.registryId, state, body.planToken),
    );
  }

  @Post('npm/:packageName')
  @Auth('system.plugins.manage')
  installPackageSpec(
    @Param('packageName') packageName: string,
    @Body('spec') spec = 'latest',
    @Body('registryId') registryId?: string,
    @Req() req?: AuthenticatedRequest,
    @Body('planToken') planToken?: string,
  ) {
    return this.installWithAudit(req, 'plugin.installed', packageName, spec, (state) =>
      this.npmPluginService.install(packageName, spec, registryId, state, planToken),
    );
  }

  @Delete('installed/:packageName')
  @Auth('system.plugins.manage')
  async removeInstalledPackage(@Param('packageName') packageName: string, @Req() req: AuthenticatedRequest) {
    const installed = this.npmPluginService.listInstalled().find((plugin) => plugin.name === packageName);
    await this.npmPluginService.removeInstalled(packageName, Boolean(req));
    if (installed) await this.recordPackage(req, 'plugin.removed', installed);
    if (req) this.pluginService.requestRestart();
    return { ok: true };
  }
}
