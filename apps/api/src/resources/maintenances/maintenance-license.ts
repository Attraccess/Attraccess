import { LicenseModuleType, type LicenseService } from '../../license/license.service';

/** Whether this installation may file maintenance requests; the same check the license guard makes. */
export async function isMaintenanceLicensed(license: Pick<LicenseService, 'verifyLicense'>): Promise<boolean> {
  try {
    await license.verifyLicense({ modules: [LicenseModuleType.MAINTENANCE] });
    return true;
  } catch {
    return false;
  }
}
