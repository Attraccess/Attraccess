import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LicenseGuard, REQUIRE_LICENSE_MODULE_KEY, SKIP_LICENSE_CHECK_KEY } from './license.guard';
import { LicenseError, LicenseModuleType, LicenseService } from './license.service';

function makeContext(handlerMeta: Record<string, unknown>, classMeta: Record<string, unknown> = {}): ExecutionContext {
  return {
    getHandler: () => handlerMeta,
    getClass: () => classMeta,
  } as unknown as ExecutionContext;
}

describe('LicenseGuard', () => {
  let guard: LicenseGuard;
  let licenseService: { verifyLicense: jest.Mock };
  let reflector: Reflector;

  beforeEach(() => {
    licenseService = { verifyLicense: jest.fn().mockResolvedValue({ valid: true }) };
    reflector = new Reflector();
    guard = new LicenseGuard(licenseService as unknown as LicenseService, reflector);
  });

  it('allows when no module metadata is set', async () => {
    const ctx = makeContext({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(licenseService.verifyLicense).not.toHaveBeenCalled();
  });

  it('allows when SkipLicenseCheck is set on handler', async () => {
    const handler = {};
    Reflect.defineMetadata(SKIP_LICENSE_CHECK_KEY, true, handler);
    Reflect.defineMetadata(REQUIRE_LICENSE_MODULE_KEY, LicenseModuleType.BILLING, handler);
    const ctx = makeContext(handler);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(licenseService.verifyLicense).not.toHaveBeenCalled();
  });

  it('calls verifyLicense with the required module', async () => {
    const handler = {};
    Reflect.defineMetadata(REQUIRE_LICENSE_MODULE_KEY, LicenseModuleType.SSO, handler);
    const ctx = makeContext(handler);
    await guard.canActivate(ctx);
    expect(licenseService.verifyLicense).toHaveBeenCalledWith({ modules: [LicenseModuleType.SSO] });
  });

  it('throws ForbiddenException when verifyLicense rejects', async () => {
    const handler = {};
    Reflect.defineMetadata(REQUIRE_LICENSE_MODULE_KEY, LicenseModuleType.ATTRACTAP, handler);
    licenseService.verifyLicense.mockRejectedValue(new LicenseError('missing module'));
    const ctx = makeContext(handler);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reads module from class metadata when handler has none', async () => {
    const cls = {};
    Reflect.defineMetadata(REQUIRE_LICENSE_MODULE_KEY, LicenseModuleType.MAINTENANCE, cls);
    const ctx = makeContext({}, cls);
    await guard.canActivate(ctx);
    expect(licenseService.verifyLicense).toHaveBeenCalledWith({ modules: [LicenseModuleType.MAINTENANCE] });
  });
});
