import { PluginLicenseError, type PluginLicenseContext, type PluginLicenseInfo } from '@attraccess/plugins-backend-sdk';
import { LicenseError, type LicenseService } from '../../license/license.service';

type LicenseSource = Pick<LicenseService, 'getLicenseData' | 'verifyLicense'>;

function reasonOf(error: unknown): string {
  if (error instanceof LicenseError) return error.reason;
  return 'LICENSE_CHECK_FAILED';
}

/**
 * `context.license`: the core {@link LicenseService} for plugins. The license is looked up per call (the service
 * verifies anew each time), so a plugin always sees the current key. Failures never reach the plugin as raw errors.
 */
export function createPluginLicenseContext(getService: () => LicenseSource): PluginLicenseContext {
  const getLicense = async (): Promise<PluginLicenseInfo> => {
    try {
      const data = await getService().getLicenseData();
      // An invalid (for example expired) Licenso license still carries its payload; it grants nothing.
      if (!data.valid) {
        return {
          valid: false,
          reason: data.reason ?? 'LICENSE_INVALID',
          modules: [],
          usageLimits: {},
          isNonProfit: data.isNonProfit,
        };
      }
      return {
        valid: true,
        modules: [...data.modules],
        usageLimits: { ...data.usageLimits },
        isNonProfit: data.isNonProfit,
      };
    } catch (error) {
      return { valid: false, reason: reasonOf(error), modules: [], usageLimits: {}, isNonProfit: false };
    }
  };

  return {
    getLicense,
    async hasModule(module) {
      const license = await getLicense();
      return license.valid && license.modules.includes(module);
    },
    async verify(requirements) {
      try {
        await getService().verifyLicense(requirements);
      } catch (error) {
        throw new PluginLicenseError(reasonOf(error));
      }
    },
  };
}
