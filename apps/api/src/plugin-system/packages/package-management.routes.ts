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

import { auditSubjectKeyId, safeAuditOrigin } from '../../audit/policies/administration';

import { randomUUID } from 'crypto';

import { AuditService } from '../../audit/audit.service';

import { InstalledNpmPlugin, NpmPluginAuditState, NpmPluginService } from '../npm-plugin.service';

import { PluginService } from '../plugin.service';

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
    return this.npmPluginService.setUpdatePolicy(body).then(async (policy) => {
      await this.record(req, 'plugin.update_policy_updated', 1, 'plugin-policy', {
        checksEnabled: policy.checksEnabled ? 1 : 0,
        updateMode: policy.mode,
        maintenanceStartMinute: policy.maintenanceWindow.startMinute,
        maintenanceDurationMinutes: policy.maintenanceWindow.durationMinutes,
        prerelease: policy.prerelease ? 1 : 0,
      });
      return policy;
    });
  }

  @Post('installed/check')
  @Auth('system.plugins.manage')
  checkAllInstalledPackages(@Req() req: AuthenticatedRequest) {
    return this.npmPluginService.checkAllInstalled().then(async (installed) => {
      for (const plugin of installed) await this.recordPackage(req, 'plugin.checked', plugin);
      return installed;
    });
  }

  @Post('installed/:packageName/check')
  @Auth('system.plugins.manage')
  checkInstalledPackage(@Param('packageName') packageName: string, @Req() req: AuthenticatedRequest) {
    return this.npmPluginService.checkInstalled(packageName).then(async (installed) => {
      await this.recordPackage(req, 'plugin.checked', installed);
      return installed;
    });
  }

  @Post('installed/:packageName/spec')
  @Auth('system.plugins.manage')
  updateInstalledPackageSpec(
    @Param('packageName') packageName: string,
    @Body('requestedSpec') requestedSpec: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.npmPluginService.updateRequestedSpec(packageName, requestedSpec).then(async (installed) => {
      await this.recordPackage(req, 'plugin.spec_updated', installed);
      return installed;
    });
  }

  @Post('installed/:packageName/update-override')
  @Auth('system.plugins.manage')
  updateInstalledPackageOverride(
    @Param('packageName') packageName: string,
    @Body('updateOverride') updateOverride: 'inherit' | 'off' | 'patch' | 'minor' | 'follow',
    @Req() req: AuthenticatedRequest,
  ) {
    return this.npmPluginService.updateOverride(packageName, updateOverride).then(async (installed) => {
      await this.recordPackage(req, 'plugin.update_override_updated', installed);
      return installed;
    });
  }

  @Post('installed/:packageName/update-policy')
  @Auth('system.plugins.manage')
  updateInstalledPackagePolicy(
    @Param('packageName') packageName: string,
    @Body() body: UpdateInstalledPluginPolicyDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.npmPluginService
      .updateVersionPolicy(packageName, body.requestedSpec, body.updateOverride)
      .then(async (installed) => {
        await this.recordPackage(req, 'plugin.package_policy_updated', installed);
        return installed;
      });
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
    const before = this.npmPluginService.listInstalled().find((plugin) => plugin.name === packageName);
    return this.installWithAudit(
      req,
      'plugin.replaced',
      packageName,
      before?.requestedSpec ?? version,
      (state) =>
        this.npmPluginService.replaceInstalled(
          packageName,
          version,
          body.approvedPermissionAdditions ?? [],
          body.approvedMajorVersion === true,
          state,
          body.planToken,
        ),
      before,
    );
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

  protected abstract readonly npmPluginService: NpmPluginService;

  protected abstract record(
    req: AuthenticatedRequest,
    action: string,
    subjectId: number,
    subjectType: string,
    details: Record<string, string | number>,
    outcome?: 'succeeded' | 'failed',
    operationId?: string,
  ): Promise<void>;

  protected abstract recordPackage(
    req: AuthenticatedRequest,
    action: string,
    installed: InstalledNpmPlugin,
  ): Promise<void>;

  protected abstract readonly pluginService: PluginService;

  protected abstract installWithAudit(
    req: AuthenticatedRequest | undefined,
    action: string,
    packageName: string,
    requestedSpec: string,
    operation: (state: NpmPluginAuditState) => Promise<InstalledNpmPlugin>,
    before?: InstalledNpmPlugin,
  ): Promise<InstalledNpmPlugin>;

  protected abstract readonly logger: Logger;

  protected abstract lifecycleDetails(state: NpmPluginAuditState): Record<string, string | number>;

  protected abstract readonly audit: AuditService;
}
