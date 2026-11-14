// No secret may leave the plugin through a log line, an audit entry or an API answer: not the recovery key, not the
// snapshot, not the decrypted content, not the stored (encrypted) key.
import { validatePluginAuditDomainDeclaration, type PluginAuditFieldPolicy } from '@attraccess/plugins-backend-sdk';
import { MATTER_AUDIT_DOMAIN } from '../connection/audit';
import { ADMIN, createFabricHarness, type FabricHarness } from '../testing/fabric-harness.test-utils';
import { MatterBackup, MatterRecoveryKey } from './entities';
import { parseRecoveryKey } from './recovery-key';
import { encryptBackup } from './format';

type AuditEvent = {
  action: string;
  subject: { type: string; id: number };
  details: Record<string, unknown>;
  outcome: string;
};

const matches = (policy: PluginAuditFieldPolicy, value: unknown): boolean => {
  if (policy.type === 'boolean') return typeof value === 'boolean';
  if (policy.type === 'number') {
    return (
      typeof value === 'number' &&
      (!policy.integer || Number.isInteger(value)) &&
      (policy.min === undefined || value >= policy.min) &&
      (policy.max === undefined || value <= policy.max)
    );
  }
  if (typeof value !== 'string') return false;
  if (policy.oneOf && !policy.oneOf.includes(value)) return false;
  return policy.pattern === undefined || new RegExp(`^(?:${policy.pattern})$`).test(value);
};

describe('secrets never leave the plugin', () => {
  let h: FabricHarness;
  let keyForms: string[];
  let secretForms: string[];
  const responses: unknown[] = [];

  const attempt = async (promise: Promise<unknown>) => {
    try {
      responses.push(await promise);
    } catch (error) {
      const e = error as { getResponse?: () => unknown; message?: string };
      responses.push(e.getResponse ? e.getResponse() : e.message);
    }
  };

  beforeAll(async () => {
    h = await createFabricHarness();
    const created = await h.fabric.create('Home', ADMIN);
    const first = created.recoveryKey?.key as string;
    await h.fabric.rotateRecoveryKey(ADMIN).then((rotated) => responses.push({ keyId: rotated.keyId }));
    const second = (await h.keys.currentKey())?.key as Buffer;
    const forms = (text: string) => {
      const raw = parseRecoveryKey(text);
      return [text, text.replace(/-/g, ''), raw.toString('base64'), raw.toString('hex')];
    };
    const secondText = second.toString('base64');
    keyForms = [...forms(first), secondText, second.toString('hex')];

    // Backups, restores, and every failure path, with logging and auditing on.
    const backup = await h.backups.backup('manual', ADMIN);
    responses.push(backup, await h.backups.list(), await h.fabric.status());
    const file = (await h.dataSource.getRepository(MatterBackup).findOneByOrFail({ id: backup.id })).blob as Buffer;
    secretForms = [
      h.backend.storage?.secret as string,
      Buffer.from(JSON.stringify({ ...h.backend.storage })).toString('base64'),
      file.toString('base64').slice(100, 160),
      (await h.dataSource.getRepository(MatterRecoveryKey).find()).map((row) => row.encryptedKey)[0],
    ];
    const validation = await h.restore.validate({ type: 'stored', backupId: backup.id }, undefined, ADMIN);
    responses.push(validation);
    await attempt(h.restore.confirm(validation.validationId, 'wrong', ADMIN));
    h.backend.faults.commitRestoreFailed = true;
    await attempt(h.restore.confirm(validation.validationId, h.backend.storage?.fabricId, ADMIN));
    h.backend.faults.commitRestoreFailed = false;
    await attempt(h.restore.validate({ type: 'stored', backupId: backup.id }, 'AAAA-BBBB', ADMIN));
    const forged = encryptBackup(
      {
        sidecar: h.backend.handle('backup.snapshot', {}) as never,
        tables: { plugin_matter_nodes: [{ lifecycle_state: 'bogus', id: 'x', node_id: '1' }] },
      },
      { pluginVersion: '0.4.0-alpha.0', pluginMigration: (await h.migrationReader()) as string },
      second,
    );
    const poisoned = await h.restore.validate(
      { type: 'upload', contentBase64: forged.toString('base64') },
      undefined,
      ADMIN,
    );
    await attempt(h.restore.confirm(poisoned.validationId, h.backend.storage?.fabricId, ADMIN));
    h.backend.faults.snapshotFails = true;
    await attempt(h.backups.backup('daily'));
    h.backend.faults.snapshotFails = false;
    h.connection.insecureTransport = true;
    await attempt(h.backups.backup('manual', ADMIN));
    await attempt(h.restore.validate({ type: 'stored', backupId: backup.id }, undefined, ADMIN));
    h.connection.insecureTransport = false;
    h.backend.clear();
    await h.fabric.detect('connect');
    const rec = await h.restore.validate({ type: 'stored', backupId: backup.id }, undefined, ADMIN);
    await h.restore.confirm(rec.validationId, undefined, ADMIN);
  });
  afterAll(() => h.close());

  it('writes no key, snapshot, file or stored key to a log line or an audit entry', () => {
    const emitted = h.emitted();
    expect(emitted.length).toBeGreaterThan(100);
    for (const form of [...keyForms, ...secretForms]) {
      expect(form.length).toBeGreaterThan(8);
      expect(emitted).not.toContain(form);
    }
  });

  it('returns no key, snapshot or stored key from any API answer or error, except the one-time reveal', () => {
    const answered = JSON.stringify(responses);
    expect(answered.length).toBeGreaterThan(100);
    for (const form of [...keyForms, ...secretForms]) expect(answered).not.toContain(form);
  });

  it('audits only declared actions, subject types and bounded detail values', () => {
    expect(() => validatePluginAuditDomainDeclaration(MATTER_AUDIT_DOMAIN)).not.toThrow();
    const events = h.audit.mock.calls.map((call) => (call as unknown as [AuditEvent])[0]);
    expect(events.length).toBeGreaterThan(15);
    for (const event of events) {
      const action = MATTER_AUDIT_DOMAIN.actions.find((candidate) => candidate.action === event.action);
      expect(action).toBeDefined();
      expect(action?.subjectTypes).toContain(event.subject.type);
      expect(Number.isInteger(event.subject.id) && event.subject.id > 0).toBe(true);
      for (const [name, value] of Object.entries(event.details)) {
        const policy = action?.details?.[name];
        expect(policy).toBeDefined();
        expect(matches(policy as PluginAuditFieldPolicy, value)).toBe(true);
      }
    }
  });

  it('audits every step of the backup and restore flows, with failures marked as failed', () => {
    const events = h.audit.mock.calls.map((call) => (call as unknown as [AuditEvent])[0]);
    const actions = new Set(events.map((event) => event.action));
    for (const expected of [
      'matter.fabric_created',
      'matter.recovery_key_generated',
      'matter.recovery_key_rotated',
      'matter.backup_succeeded',
      'matter.backup_failed',
      'matter.restore_validated',
      'matter.restore_refused',
      'matter.restore_confirmed',
      'matter.restore_succeeded',
      'matter.restore_failed',
      'matter.restore_rolled_back',
      'matter.fabric_recovery_required',
    ]) {
      expect(actions).toContain(expected);
    }
    for (const event of events.filter((e) => /_failed$|_refused$|rolled_back$/.test(e.action))) {
      expect(event.outcome).toBe('failed');
    }
    // A scheduled or event-driven backup has no administrator: the audit entry says it was the plugin itself.
    expect(
      events.find((e) => e.action === 'matter.backup_failed' && e.details['trigger'] === 'daily')?.details['system'],
    ).toBe(true);
    expect(
      events.find((e) => e.action === 'matter.backup_succeeded' && e.details['trigger'] === 'manual')?.details[
        'system'
      ],
    ).toBe(false);
  });
});
