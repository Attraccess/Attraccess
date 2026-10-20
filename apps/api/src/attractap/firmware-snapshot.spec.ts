import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkFirmwareQualification, openQualifiedOtaSnapshot } from './firmware.service';
import { AttractapFirmware } from './dtos/firmware.dto';

const canonical = (value: unknown): string => {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
};

describe('qualified OTA snapshots (synthetic qualification, no hardware)', () => {
  let root: string;
  let trust: string | undefined;
  let firmware: AttractapFirmware;
  const binary = Buffer.alloc(8192, 0xa5);
  beforeAll(() => {
    root = fs.mkdtempSync(join(tmpdir(), 'qualified-snapshot-test-'));
    fs.chmodSync(root, 0o700);
    trust = process.env.ATTRACTAP_QUALIFICATION_PUBLIC_KEY_FILE;
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 });
    const trustFile = join(root, 'trust.pem');
    fs.writeFileSync(trustFile, publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o600 });
    process.env.ATTRACTAP_QUALIFICATION_PUBLIC_KEY_FILE = trustFile;
    firmware = Object.assign(new AttractapFirmware(), {
      name: 'reader',
      variant: 'touch',
      version: '1',
      filename: 'full.bin',
      filenameOTA: 'ota.bin',
      securityProfile: 'production',
      qualificationFile: 'qualification.json',
    });
    const now = Math.floor(Date.now() / 1000);
    const digest = crypto.createHash('sha256').update(binary).digest('hex');
    const payload = {
      version: 1,
      model: 'existing-board-v1',
      evidenceClass: 'hardware',
      result: 'passed',
      reviewer: 'synthetic-test',
      qualifiedAt: now - 60,
      expiresAt: now + 3600,
      inventoryDigest: 'a'.repeat(64),
      evidenceDigest: 'b'.repeat(64),
      artifacts: { 'full.bin': digest, 'ota.bin': digest },
    };
    const signature = crypto
      .sign('sha256', Buffer.from('ATTR-QUAL-V1\n' + canonical(payload), 'ascii'), {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: 32,
      })
      .toString('base64');
    fs.writeFileSync(join(root, 'qualification.json'), JSON.stringify({ payload, signature }));
  });
  beforeEach(() => {
    fs.writeFileSync(join(root, 'full.bin'), binary);
    fs.writeFileSync(join(root, 'ota.bin'), binary);
  });
  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
    if (trust === undefined) delete process.env.ATTRACTAP_QUALIFICATION_PUBLIC_KEY_FILE;
    else process.env.ATTRACTAP_QUALIFICATION_PUBLIC_KEY_FILE = trust;
  });

  it('rejects a same-size replacement between selection and snapshot creation', () => {
    checkFirmwareQualification(firmware, root);
    fs.writeFileSync(join(root, 'ota.bin'), Buffer.alloc(binary.length, 1));
    expect(() => openQualifiedOtaSnapshot(firmware, root)).toThrow('Qualification does not match');
  });

  it.each(['overwrite', 'rename'])('transfers the qualified bytes after source %s', (operation) => {
    const snapshot = openQualifiedOtaSnapshot(firmware, root);
    try {
      const source = join(root, 'ota.bin');
      if (operation === 'rename') fs.renameSync(source, join(root, 'old.bin'));
      fs.writeFileSync(source, Buffer.alloc(binary.length, 1));
      const transferred = Buffer.alloc(snapshot.size);
      expect(fs.readSync(snapshot.fd, transferred, 0, transferred.length, 0)).toBe(binary.length);
      expect(transferred).toEqual(binary);
    } finally {
      fs.closeSync(snapshot.fd);
    }
  });
});
