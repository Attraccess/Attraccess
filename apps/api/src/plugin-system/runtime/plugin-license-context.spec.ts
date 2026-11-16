import { PluginLicenseError } from '@attraccess/plugins-backend-sdk';
import { LicenseError } from '../../license/license.service';
import { createPluginLicenseContext } from './plugin-license-context';

describe('createPluginLicenseContext', () => {
  const data = { valid: true, modules: ['wago'], usageLimits: { users: 5 }, isNonProfit: false };
  const make = (overrides: Partial<{ getLicenseData: jest.Mock; verifyLicense: jest.Mock }> = {}) => {
    const service = {
      getLicenseData: jest.fn().mockResolvedValue(data),
      verifyLicense: jest.fn().mockResolvedValue(data),
      ...overrides,
    };
    return { service, context: createPluginLicenseContext(() => service as never) };
  };

  it('returns the license data', async () => {
    const { context } = make();
    await expect(context.getLicense()).resolves.toEqual(data);
  });

  it('answers hasModule from the license', async () => {
    const { context } = make();
    await expect(context.hasModule('wago')).resolves.toBe(true);
    await expect(context.hasModule('other')).resolves.toBe(false);
  });

  it('does not grant modules of an invalid license', async () => {
    const { context } = make({
      getLicenseData: jest.fn().mockResolvedValue({ ...data, valid: false, reason: 'EXPIRED' }),
    });
    await expect(context.hasModule('wago')).resolves.toBe(false);
    await expect(context.getLicense()).resolves.toMatchObject({ valid: false, reason: 'EXPIRED' });
  });

  it('reports an undeterminable license instead of throwing', async () => {
    const { context } = make({ getLicenseData: jest.fn().mockRejectedValue(new LicenseError('Failed to verify')) });
    await expect(context.getLicense()).resolves.toEqual({
      valid: false,
      reason: 'Failed to verify',
      modules: [],
      usageLimits: {},
      isNonProfit: false,
    });
    await expect(context.hasModule('wago')).resolves.toBe(false);
  });

  it('survives unexpected errors, such as a host that is not ready', async () => {
    const { context } = make({ getLicenseData: jest.fn().mockRejectedValue(new Error('not ready')) });
    await expect(context.getLicense()).resolves.toMatchObject({ valid: false, reason: 'LICENSE_CHECK_FAILED' });
  });

  it('delegates verify to the core service and passes the requirements', async () => {
    const { context, service } = make();
    await expect(context.verify({ modules: ['wago'], usageLimits: { users: 1 } })).resolves.toBeUndefined();
    expect(service.verifyLicense).toHaveBeenCalledWith({ modules: ['wago'], usageLimits: { users: 1 } });
  });

  it('throws a PluginLicenseError with the reason when verify fails', async () => {
    const { context } = make({
      verifyLicense: jest.fn().mockRejectedValue(new LicenseError('Trying to use module(s): wago')),
    });
    const error = await context.verify({ modules: ['wago'] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PluginLicenseError);
    expect((error as PluginLicenseError).reason).toBe('Trying to use module(s): wago');
  });
});
