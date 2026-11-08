import { HEADERS_METADATA } from '@nestjs/common/constants';
import { projectAttractapAuditEvent } from '../../audit/audit-policy';
import { AttractapSecureBootKeysController } from './secure-boot-keys.controller';

const FP = 'a'.repeat(64);
const request = { user: { id: 7, authenticationMethod: 'session' } } as never;

describe('AttractapSecureBootKeysController', () => {
  const keys = {
    createKeys: jest.fn(async () => ({ signingFingerprint: FP, recoveryFingerprint: FP })),
    downloadRecoveryKey: jest.fn(async () => ({ pem: 'PEM', fingerprint: FP })),
    checkRecoveryKey: jest.fn(async () => ({ fingerprint: FP })),
    downloadSigningKeyBackup: jest.fn(async () => ({ pem: 'PEM', fingerprint: FP })),
    restore: jest.fn(async () => ({ signingFingerprint: FP, recoveryFingerprint: FP })),
  };
  const events: Array<Parameters<typeof projectAttractapAuditEvent>[0]> = [];
  const audit = { recordAttractap: jest.fn(async (event) => void events.push(event)) };
  const controller = new AttractapSecureBootKeysController(keys as never, audit as never);

  beforeEach(() => (events.length = 0));

  it('audits every key operation with fingerprints only, never key material or the passphrase', async () => {
    await controller.createKeys(request);
    await controller.downloadRecoveryKey({ passphrase: 'secret passphrase' }, request);
    await controller.checkRecoveryKey({ pem: 'PEM-IN', passphrase: 'secret passphrase' }, request);
    await controller.downloadSigningKeyBackup({ passphrase: 'secret passphrase' }, request);
    await controller.restore({ source: 'recovery-file', pem: 'PEM-IN', passphrase: 'secret passphrase' }, request);

    expect(events.map((e) => e.action)).toEqual([
      'reader.secure_keys_created',
      'reader.recovery_key_downloaded',
      'reader.recovery_key_verified',
      'reader.signing_key_backup_downloaded',
      'reader.secure_keys_restored',
    ]);
    for (const event of events) {
      expect(JSON.stringify(event)).not.toMatch(/PEM|passphrase/);
      expect(projectAttractapAuditEvent(event)).toEqual(event); // survives the whitelist projection
      expect(event.subjectType).toBe('attractap.installation');
    }
  });

  it('drops audit details that are not fingerprints', () => {
    const event = {
      action: 'reader.secure_keys_created' as const,
      subjectType: 'attractap.installation' as const,
      subjectId: 1,
      actorId: 7,
      authenticationMethod: 'session' as const,
      details: { signingFingerprint: 'not-a-hash', recoveryFingerprint: FP },
    };
    expect(projectAttractapAuditEvent(event)).toBeNull();
    const restored = {
      ...event,
      action: 'reader.secure_keys_restored' as const,
      details: { signingFingerprint: FP, recoveryFingerprint: FP, source: 'recovery-file', pem: 'PEM' },
    };
    // a stray field (here key material) rejects the whole event rather than being stored
    expect(projectAttractapAuditEvent(restored)).toBeNull();
    const whitelisted = { signingFingerprint: FP, recoveryFingerprint: FP, source: 'recovery-file' };
    expect(projectAttractapAuditEvent({ ...restored, details: whitelisted })?.details).toEqual(whitelisted);
    expect(projectAttractapAuditEvent({ ...restored, details: { ...whitelisted, source: 'bogus' } })).toBeNull();
  });

  it('records nothing when the key operation fails', async () => {
    keys.checkRecoveryKey.mockRejectedValueOnce(new Error('wrong passphrase'));
    await expect(controller.checkRecoveryKey({ pem: 'PEM-IN', passphrase: 'wrong' }, request)).rejects.toThrow();
    expect(events).toEqual([]);
  });

  it('keeps downloaded key files out of HTTP caches', () => {
    for (const method of ['downloadRecoveryKey', 'downloadSigningKeyBackup'] as const) {
      expect(Reflect.getMetadata(HEADERS_METADATA, AttractapSecureBootKeysController.prototype[method])).toContainEqual(
        {
          name: 'Cache-Control',
          value: 'no-store',
        },
      );
    }
  });
});
