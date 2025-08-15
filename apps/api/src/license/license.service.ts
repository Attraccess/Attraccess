import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfigType } from '../config/app.config';
import { LicenseDataDto } from './dtos/license.dto';

export class LicenseError extends Error {
  public reason: string;

  constructor(reason: string) {
    super(`LICENSE_ERROR: ${reason}`);
    this.reason = reason;
    this.name = 'LicenseError';
  }
}

export enum LicenseUsageLimitType {
  RESOURCES = 'resources',
  USERS = 'users',
}
export enum LicenseModuleType {
  ATTRACTAP = 'attractap',
  SSO = 'sso',
}

interface LicenseRequirements {
  modules?: LicenseModuleType[];
  usageLimits?: { [key in LicenseUsageLimitType]?: number | undefined };
}

@Injectable()
export class LicenseService {
  constructor(private readonly configService: ConfigService) {}

  async getLicenseData(): Promise<LicenseDataDto> {
    const appConfig = this.configService.get<AppConfigType>('app');
    if (!appConfig) {
      throw new LicenseError('Application configuration not loaded');
    }

    if (
      appConfig.LICENSE_KEY ===
      'I AM USING THIS SOFTWARE ONLY FOR NON-PROFIT AND COMPLY TO ALL TERMS OF THE LICENSE.md at https://github.com/Attraccess/Attraccess/blob/main/LICENSE.md'
    ) {
      return {
        valid: true,
        modules: Object.values(LicenseModuleType),
        usageLimits: Object.fromEntries(
          Object.values(LicenseUsageLimitType).map((usageLimit) => [usageLimit, Infinity])
        ),
        isNonProfit: true,
      };
    }

    // Lazy-load ESM dependency to keep Jest/CommonJS happy in tests
    const { verifyLicense } = await import('@licenso/client');
    const licenseData = await verifyLicense(
      appConfig.LICENSE_KEY,
      appConfig.LICENSO_PUBLIC_KEY,
      appConfig.LICENSO_DEVICE_ID
    );

    const dto: LicenseDataDto = {
      valid: licenseData.valid,
      reason: licenseData.reason,
      modules: Object.entries(licenseData.payload.cfg.modules)
        .filter(([, value]) => value === true)
        .map(([key]) => key),
      usageLimits: licenseData.payload.cfg.usageLimits ?? {},
      isNonProfit: false,
    };

    return dto;
  }

  async verifyLicense(requirements?: LicenseRequirements): Promise<LicenseDataDto> {
    const licenseData = await this.getLicenseData();

    if (!licenseData.valid) {
      throw new LicenseError(licenseData.reason);
    }

    if (!requirements) {
      return licenseData;
    }

    const missingModules = (requirements.modules ?? []).filter((module) => !licenseData.modules.includes(module));

    if (missingModules.length > 0) {
      throw new LicenseError(
        `Trying to use module(s) that are not included in the license: ${missingModules.join(', ')}`
      );
    }

    const currentUsages = requirements.usageLimits ?? {};
    const reachedUsageLimits = Object.entries(currentUsages).filter(([module, currentUsage]) => {
      const limit = licenseData.usageLimits[module] || -1;
      if (limit === -1) {
        return false;
      }
      return currentUsage >= limit;
    });

    if (reachedUsageLimits.length > 0) {
      throw new LicenseError(
        `Trying to use more than the allowed amount of ${reachedUsageLimits.map(([module]) => module).join(', ')}`
      );
    }

    return licenseData;
  }
}
