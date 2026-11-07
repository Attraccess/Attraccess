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
  });
});
