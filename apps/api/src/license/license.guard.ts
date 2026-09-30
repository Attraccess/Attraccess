import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LicenseModuleType, LicenseService } from './license.service';

export const REQUIRE_LICENSE_MODULE_KEY = 'requireLicenseModule';
export const SKIP_LICENSE_CHECK_KEY = 'skipLicenseCheck';

@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(
    private readonly licenseService: LicenseService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_LICENSE_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skip) {
      return true;
    }

    const module = this.reflector.getAllAndOverride<LicenseModuleType>(REQUIRE_LICENSE_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!module) {
      return true;
    }

    try {
      await this.licenseService.verifyLicense({ modules: [module] });
      return true;
    } catch {
      throw new ForbiddenException(`This feature requires the '${module}' license module`);
    }
  }
}
