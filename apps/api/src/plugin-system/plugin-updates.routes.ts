import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Get, Param, Post, Req } from '@nestjs/common';
import { ReplaceInstalledPluginDto, UpdateInstalledPluginPolicyDto } from './dto/npm-plugin-request.dto';
import { PluginInstallRoutesImplementation } from './plugin-install.routes';
export abstract class PluginUpdatesRoutesImplementation extends PluginInstallRoutesImplementation {
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
}
