import type { Repository } from 'typeorm';
import type { AuthenticationDetail, Setting, User } from '@attraccess/database-entities';
import type { SettingsService } from '../../settings/settings.service';
import type { EncryptionService } from '../../encryption/encryption.service';
import type { MetricsService } from '../../metrics/metrics.service';
import { TwoFactorService } from './two-factor.service';
jest.mock('otplib', () => ({
  verify: jest.fn(),
  generateSecret: jest.fn().mockReturnValue('TOTP-FIXTURE'),
  generateURI: jest.fn().mockReturnValue('otpauth://fixture'),
}));
const otp = jest.requireMock('otplib') as { verify: jest.Mock; generateURI: jest.Mock };
describe('TwoFactorService enrollment and login', () => {
  const repository = { findOne: jest.fn(), save: jest.fn(), delete: jest.fn() };
  const settings = { getUrl: jest.fn().mockResolvedValue('https://workspace.test') };
  const encryption = {
    encrypt: jest.fn((secret: string) => `encrypted:${secret}`),
    decryptIfEncrypted: jest.fn().mockReturnValue('TOTP-FIXTURE'),
  };
  const metrics = { auth2faUsageTotal: { inc: jest.fn() } };
  const user = { id: 7, username: 'fixture', email: 'user@example.test' } as User;
  let service: TwoFactorService;
  beforeEach(() => {
    jest.clearAllMocks();
    repository.findOne.mockReset();
    otp.verify.mockResolvedValue({ valid: true });
    service = new TwoFactorService(
      repository as unknown as Repository<AuthenticationDetail>,
      {} as Repository<Setting>,
      settings as unknown as SettingsService,
      encryption as unknown as EncryptionService,
      metrics as unknown as MetricsService,
    );
  });
  it('stores an encrypted setup secret without enabling two-factor authentication prematurely', async () => {
    repository.findOne.mockResolvedValue(null);
    expect(await service.createSetup(user)).toEqual({ secret: 'TOTP-FIXTURE', otpauthUrl: 'otpauth://fixture' });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, totpSecret: 'encrypted:TOTP-FIXTURE', totpEnabledAt: null }),
    );
    expect(otp.generateURI).toHaveBeenCalledWith({
      secret: 'TOTP-FIXTURE',
      label: 'user@example.test',
      issuer: 'Attraccess (workspace.test)',
      strategy: 'totp',
    });
  });
  it('enables only initialized factors after validating a normalized code', async () => {
    repository.findOne.mockResolvedValueOnce(null);
    await expect(service.enable(user, '123456')).rejects.toThrow('TwoFactorNotInitialized');
    const detail = { id: 9, totpSecret: 'encrypted:TOTP-FIXTURE', totpEnabledAt: null };
    repository.findOne.mockResolvedValue(detail);
    otp.verify.mockResolvedValueOnce({ valid: false });
    await expect(service.enable(user, '000000')).rejects.toThrow('TwoFactorInvalidCode');
    expect(repository.save).not.toHaveBeenCalled();
    await service.enable(user, '123 456');
    expect(otp.verify).toHaveBeenLastCalledWith({
      secret: 'TOTP-FIXTURE',
      token: '123456',
      strategy: 'totp',
      epochTolerance: 30,
    });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ totpEnabledAt: expect.any(Date) }));
    await expect(service.enable(user, '123456')).rejects.toThrow('TwoFactorAlreadyEnabled');
  });
  it('requires and validates a code for enabled factors while allowing unconfigured users through this check', async () => {
    repository.findOne.mockResolvedValueOnce(null);
    await expect(service.assertTwoFactorForLogin(user, undefined)).resolves.toBeUndefined();
    repository.findOne.mockResolvedValue({ id: 9, totpSecret: 'encrypted:TOTP-FIXTURE', totpEnabledAt: new Date() });
    await expect(service.assertTwoFactorForLogin(user, undefined)).rejects.toThrow('TwoFactorRequired');
    otp.verify.mockResolvedValueOnce(false);
    await expect(service.assertTwoFactorForLogin(user, '000000')).rejects.toThrow('TwoFactorInvalidCode');
    await expect(service.assertTwoFactorForLogin(user, '123456')).resolves.toBeUndefined();
  });
  it('disables only enabled factors after successful verification', async () => {
    repository.findOne.mockResolvedValueOnce(null);
    await expect(service.disable(user, '123456')).rejects.toThrow('TwoFactorNotEnabled');
    repository.findOne.mockResolvedValue({ id: 9, totpSecret: 'encrypted:TOTP-FIXTURE', totpEnabledAt: new Date() });
    otp.verify.mockResolvedValueOnce({ valid: false });
    await expect(service.disable(user, '000000')).rejects.toThrow('TwoFactorInvalidCode');
    expect(repository.delete).not.toHaveBeenCalled();
    await service.disable(user, '123456');
    expect(repository.delete).toHaveBeenCalledWith(9);
    expect(metrics.auth2faUsageTotal.inc).toHaveBeenCalledWith({ action: 'disable' });
  });
});
