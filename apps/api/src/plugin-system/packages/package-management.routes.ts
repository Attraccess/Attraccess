import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';

import { Body, Get, Param, Post, Req, Delete, Query, Logger } from '@nestjs/common';

import {
  ReplaceInstalledPluginDto,
  UpdateInstalledPluginPolicyDto,
  InstallPluginDto,
  RemoveInstalledPluginDto,
  AddPluginRegistryDto,
} from '../dto/npm-plugin-request.dto';

import { ApiQuery, ApiResponse } from '@nestjs/swagger';

import { PluginDependencyPlanDto, PluginRemovalItemDto } from '../dto/plugin-dependency-plan.dto';

import { randomUUID } from 'crypto';

import { auditActorOf } from '../../audit/recorder/audit-event';

import { NpmPluginService } from '../npm-plugin.service';

import { PluginAdministrationService } from '../plugin-administration.service';

export const PLUGIN_SYSTEM_INSTANCE_ID = randomUUID();

export abstract class PackageManagementRoutes {
  @Get('installed')
  @Auth('system.plugins.manage')
  installedPackages() {
    return this.npmPluginService.listInstalled();
  }

  @Get('update-policy')
  @Auth('system.plugins.manage')
  updatePolicy() {
    return this.npmPluginService.getUpdatePolicy();
  }

  @Post('update-policy')
  @Auth('system.plugins.manage')
  setUpdatePolicy(@Body() body: Record<string, unknown>, @Req() req: AuthenticatedRequest) {
    return this.pluginAdministration.setUpdatePolicy(body, auditActorOf(req.user));
  }

  @Post('installed/check')
  @Auth('system.plugins.manage')
  checkAllInstalledPackages(@Req() req: AuthenticatedRequest) {
    return this.pluginAdministration.checkAllInstalled(auditActorOf(req.user));
  }

  @Post('installed/:packageName/check')
  @Auth('system.plugins.manage')
  checkInstalledPackage(@Param('packageName') packageName: string, @Req() req: AuthenticatedRequest) {
    return this.pluginAdministration.checkInstalled(packageName, auditActorOf(req.user));
  }

  @Post('installed/:packageName/spec')
  @Auth('system.plugins.manage')
  updateInstalledPackageSpec(
    @Param('packageName') packageName: string,
    @Body('requestedSpec') requestedSpec: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.pluginAdministration.updateRequestedSpec(packageName, requestedSpec, auditActorOf(req.user));
  }

  @Post('installed/:packageName/update-override')
  @Auth('system.plugins.manage')
  updateInstalledPackageOverride(
    @Param('packageName') packageName: string,
    @Body('updateOverride') updateOverride: 'inherit' | 'off' | 'patch' | 'minor' | 'follow',
    @Req() req: AuthenticatedRequest,
  ) {
    return this.pluginAdministration.updateOverride(packageName, updateOverride, auditActorOf(req.user));
  }

  @Post('installed/:packageName/update-policy')
  @Auth('system.plugins.manage')
  updateInstalledPackagePolicy(
    @Param('packageName') packageName: string,
    @Body() body: UpdateInstalledPluginPolicyDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.pluginAdministration.updateVersionPolicy(
      packageName,
      body.requestedSpec,
      body.updateOverride,
      auditActorOf(req.user),
    );
  }

  @Get('installed/:packageName/versions')
  @Auth('system.plugins.manage')
  installedPackageVersions(@Param('packageName') packageName: string) {
    return this.npmPluginService.installedVersionCandidates(packageName);
  }

  @Post('installed/:packageName/versions/:version')
  @Auth('system.plugins.manage')
  replaceInstalledPackage(
    @Param('packageName') packageName: string,
    @Param('version') version: string,
    @Body() body: ReplaceInstalledPluginDto,
    @Req() req?: AuthenticatedRequest,
  ) {
    return this.pluginAdministration.replaceInstalled(packageName, version, body, req && auditActorOf(req.user));
  }

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
    await this.pluginAdministration.removePackageGraph(
      packageName,
      body.approvedDependants ?? [],
      auditActorOf(req.user),
    );
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
    return this.pluginAdministration.install(
      packageName,
      version,
      body.registryId,
      body.planToken,
      req && auditActorOf(req.user),
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
    return this.pluginAdministration.install(packageName, spec, registryId, planToken, req && auditActorOf(req.user));
  }

  @Delete('installed/:packageName')
  @Auth('system.plugins.manage')
  async removeInstalledPackage(@Param('packageName') packageName: string, @Req() req: AuthenticatedRequest) {
    await this.pluginAdministration.removeInstalled(packageName, auditActorOf(req.user));
    return { ok: true };
  }

  @Get('registries')
  @Auth('system.plugins.manage')
  listRegistries() {
    return this.npmPluginService.listRegistries();
  }

  @Post('registries')
  @Auth('system.plugins.manage')
  addRegistry(@Body() body: AddPluginRegistryDto, @Req() req: AuthenticatedRequest) {
    return this.pluginAdministration.addRegistry(body, auditActorOf(req.user));
  }

  @Post('registries/:registryId/test')
  @Auth('system.plugins.manage')
  async testRegistry(@Param('registryId') registryId: string, @Req() req: AuthenticatedRequest) {
    await this.pluginAdministration.testRegistry(registryId, auditActorOf(req.user));
    return { ok: true };
  }

  @Delete('registries/:registryId')
  @Auth('system.plugins.manage')
  removeRegistry(@Param('registryId') registryId: string, @Req() req: AuthenticatedRequest) {
    return this.pluginAdministration.removeRegistry(registryId, auditActorOf(req.user));
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

  protected abstract readonly npmPluginService: NpmPluginService;

  protected abstract readonly pluginAdministration: PluginAdministrationService;

  protected abstract readonly logger: Logger;
}
