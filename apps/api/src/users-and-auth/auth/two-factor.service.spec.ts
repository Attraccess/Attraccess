import type { TotpCredentialRecord } from '@attraccess/application-models';
import type { SettingsRows } from '../../settings/settings-rows.port';
import type { SettingsService } from '../../settings/settings.service';
import type { EncryptionService } from '../../encryption/encryption.service';
import type { MetricsService } from '../../metrics/metrics.service';
import type { TotpStore } from './credentials/credential-store.port';
import { TwoFactorPolicy } from './two-factor.dto';
import { TwoFactorService } from './two-factor.service';
jest.mock('otplib', () => ({
  verify: jest.fn(),
  generateSecret: jest.fn().mockReturnValue('TOTP-FIXTURE'),
  generateURI: jest.fn().mockReturnValue('otpauth://fixture'),
}));
const otp = jest.requireMock('otplib') as { verify: jest.Mock; generateURI: jest.Mock };

const enrollment = (overrides: Partial<TotpCredentialRecord> = {}): TotpCredentialRecord => ({
  id: 9,
  userId: 7,
  encryptedSecret: 'encrypted:TOTP-FIXTURE',
  enabledAt: null,
  ...overrides,
});

describe('TwoFactorService enrollment and login', () => {
  const totp = {
    find: jest.fn(),
    saveSetup: jest.fn(),
    markEnabled: jest.fn(),
    remove: jest.fn(),
  } satisfies Record<keyof TotpStore, jest.Mock>;
  const settingRows = { findValue: jest.fn(), upsertValue: jest.fn(), remove: jest.fn() } satisfies Record<
    keyof SettingsRows,
    jest.Mock
  >;
  const settings = { getUrl: jest.fn().mockResolvedValue('https://workspace.test') };
  const encryption = {
    encrypt: jest.fn((secret: string) => `encrypted:${secret}`),
    decryptIfEncrypted: jest.fn().mockReturnValue('TOTP-FIXTURE'),
  };
  const metrics = { auth2faUsageTotal: { inc: jest.fn() } };
  const user = { id: 7, username: 'fixture', email: 'user@example.test' };
  const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
  const origin = { actor: { id: 7, authenticationMethod: 'session' as const }, request: { ipAddress: '127.0.0.1' } };
  let service: TwoFactorService;
  beforeEach(() => {
    jest.clearAllMocks();
    totp.find.mockReset();
    settingRows.findValue.mockReset();
    otp.verify.mockResolvedValue({ valid: true });
    service = new TwoFactorService(
      totp,
      settingRows,
      settings as unknown as SettingsService,
      encryption as unknown as EncryptionService,
      metrics as unknown as MetricsService,
      audit as never,
    );
  });

  it('stores an encrypted setup secret without enabling two-factor authentication prematurely', async () => {
    totp.find.mockResolvedValue(null);
    expect(await service.createSetup(user, origin)).toEqual({
      secret: 'TOTP-FIXTURE',
      otpauthUrl: 'otpauth://fixture',
    });
    expect(totp.saveSetup).toHaveBeenCalledWith(7, 'encrypted:TOTP-FIXTURE');
    expect(totp.markEnabled).not.toHaveBeenCalled();
    expect(otp.generateURI).toHaveBeenCalledWith({
      secret: 'TOTP-FIXTURE',
      label: 'user@example.test',
      issuer: 'Attraccess (workspace.test)',
      strategy: 'totp',
    });
  });

  it('refuses a new setup while two-factor authentication is enabled', async () => {
    totp.find.mockResolvedValue(enrollment({ enabledAt: new Date() }));
    await expect(service.createSetup(user, origin)).rejects.toThrow('TwoFactorAlreadyEnabled');
    expect(totp.saveSetup).not.toHaveBeenCalled();
  });

  it('enables only initialized factors after validating a normalized code', async () => {
    totp.find.mockResolvedValueOnce(null);
    await expect(service.enable(user, '123456', origin)).rejects.toThrow('TwoFactorNotInitialized');
    totp.find.mockResolvedValue(enrollment());
    otp.verify.mockResolvedValueOnce({ valid: false });
    await expect(service.enable(user, '000000', origin)).rejects.toThrow('TwoFactorInvalidCode');
    expect(totp.markEnabled).not.toHaveBeenCalled();
    await service.enable(user, '123 456', origin);
    expect(otp.verify).toHaveBeenLastCalledWith({
      secret: 'TOTP-FIXTURE',
      token: '123456',
      strategy: 'totp',
      epochTolerance: 30,
    });
    expect(totp.markEnabled).toHaveBeenCalledWith(9, expect.any(Date));
    totp.find.mockResolvedValue(enrollment({ enabledAt: new Date() }));
    await expect(service.enable(user, '123456', origin)).rejects.toThrow('TwoFactorAlreadyEnabled');
  });

  it('requires and validates a code for enabled factors while allowing unconfigured users through this check', async () => {
    totp.find.mockResolvedValueOnce(null);
    await expect(service.assertTwoFactorForLogin(user, undefined)).resolves.toBeUndefined();
    totp.find.mockResolvedValue(enrollment({ enabledAt: new Date() }));
    await expect(service.assertTwoFactorForLogin(user, undefined)).rejects.toThrow('TwoFactorRequired');
    otp.verify.mockResolvedValueOnce(false);
    await expect(service.assertTwoFactorForLogin(user, '000000')).rejects.toThrow('TwoFactorInvalidCode');
    await expect(service.assertTwoFactorForLogin(user, '123456')).resolves.toBeUndefined();
  });

  it('does not ask for a code while the enrollment is still pending', async () => {
    totp.find.mockResolvedValue(enrollment({ enabledAt: null }));
    await expect(service.assertTwoFactorForLogin(user, undefined)).resolves.toBeUndefined();
    expect(otp.verify).not.toHaveBeenCalled();
  });

  it('disables only enabled factors after successful verification', async () => {
    totp.find.mockResolvedValueOnce(null);
    await expect(service.disable(user, '123456', origin)).rejects.toThrow('TwoFactorNotEnabled');
    totp.find.mockResolvedValue(enrollment({ enabledAt: new Date() }));
    otp.verify.mockResolvedValueOnce({ valid: false });
    await expect(service.disable(user, '000000', origin)).rejects.toThrow('TwoFactorInvalidCode');
    expect(totp.remove).not.toHaveBeenCalled();
    await service.disable(user, '123456', origin);
    expect(totp.remove).toHaveBeenCalledWith(9);
    expect(metrics.auth2faUsageTotal.inc).toHaveBeenCalledWith({ action: 'disable' });
  });

  it('reports the stored policy and falls back to optional for unknown values', async () => {
    totp.find.mockResolvedValue(null);
    settingRows.findValue.mockResolvedValueOnce(TwoFactorPolicy.REQUIRED_FOR_ALL);
    await expect(service.getStatus(user)).resolves.toEqual({
      enabled: false,
      required: true,
      policy: TwoFactorPolicy.REQUIRED_FOR_ALL,
    });
    expect(settingRows.findValue).toHaveBeenCalledWith('auth', 'two_factor_policy');
    settingRows.findValue.mockResolvedValueOnce('nonsense');
    await expect(service.getPolicy()).resolves.toBe(TwoFactorPolicy.OPTIONAL);
    await service.setPolicy(TwoFactorPolicy.REQUIRED_FOR_PRIVILEGED);
    expect(settingRows.upsertValue).toHaveBeenCalledWith('auth', 'two_factor_policy', 'required_for_privileged');
  });

  it('never returns the stored secret from the status', async () => {
    totp.find.mockResolvedValue(enrollment({ enabledAt: new Date() }));
    settingRows.findValue.mockResolvedValue(null);
    const status = await service.getStatus(user);
    expect(JSON.stringify(status)).not.toContain('TOTP-FIXTURE');
    expect(status).toEqual({ enabled: true, required: false, policy: TwoFactorPolicy.OPTIONAL });
  });
});
