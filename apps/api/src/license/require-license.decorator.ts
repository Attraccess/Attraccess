import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { LicenseModuleType } from './license.service';
import { LicenseGuard, REQUIRE_LICENSE_MODULE_KEY } from './license.guard';

export const RequiresLicense = (module: LicenseModuleType) => {
  return applyDecorators(SetMetadata(REQUIRE_LICENSE_MODULE_KEY, module), UseGuards(LicenseGuard));
};
