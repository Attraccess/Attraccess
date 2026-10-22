const { checkFirmwareQualification } = require('./src/attractap/firmware.service');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { checkQualification, copyFirmwareAssets } = require('./copy-attractap-firmware-into-assets');

// Ephemeral signer for gate tests only. No receipt enters a real catalog,
// provisioning apply, device, or retained hardware-qualification record.
describe('firmware asset qualification boundary', () => {
  let root, source, destination, trust, firmware, signer, payload;
  const canonical = (value) =>
    value && typeof value === 'object'
      ? '{' +
        Object.keys(value)
          .sort()
          .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
          .join(',') +
        '}'
      : JSON.stringify(value);
  beforeAll(() => {
    signer = crypto.generateKeyPairSync('rsa', { modulusLength: 3072 });
  });
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'firmware-gate-'));
    fs.chmodSync(root, 0o700);
    source = path.join(root, 'source');
    destination = path.join(root, 'destination');
    fs.mkdirSync(source);
    trust = path.join(root, 'reviewer.pem');
    fs.writeFileSync(trust, signer.publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o600 });
    fs.writeFileSync(path.join(source, 'reader.bin'), Buffer.alloc(8192, 0xa5));
    fs.writeFileSync(path.join(source, 'reader_ota.bin'), Buffer.alloc(8192, 0xa5));
    firmware = {
      name: 'reader',
      variant: 'touch',
      filename: 'reader.bin',
      filenameOTA: 'reader_ota.bin',
      securityProfile: 'production',
      qualificationFile: 'qualification.json',
    };
    const now = Math.floor(Date.now() / 1000);
    const digest = crypto.createHash('sha256').update(Buffer.alloc(8192, 0xa5)).digest('hex');
    payload = {
      version: 1,
      model: 'existing-board-v1',
      evidenceClass: 'hardware',
      result: 'passed',
      reviewer: 'Unit test fixture',
      qualifiedAt: now - 10,
      expiresAt: now + 100,
      inventoryDigest: 'a'.repeat(64),
      evidenceDigest: 'b'.repeat(64),
      artifacts: { 'reader.bin': digest, 'reader_ota.bin': digest },
    };
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  function sign() {
    const signature = crypto.sign('sha256', Buffer.from('ATTR-QUAL-V1\n' + canonical(payload), 'ascii'), {
      key: signer.privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    });
    fs.writeFileSync(
      path.join(source, 'qualification.json'),
      JSON.stringify({ payload, signature: signature.toString('base64') }),
    );
  }
  it('requires installed trust, matching bytes, a current signature and hardware evidence', () => {
    expect(() => checkQualification(firmware, source)).toThrow();
    sign();
    expect(() => checkQualification(firmware, source, trust)).not.toThrow();
    expect(() => checkFirmwareQualification(firmware, source, trust)).not.toThrow();
    for (const mutate of [
      () => {
        payload.evidenceClass = 'simulation';
      },
      () => {
        payload.expiresAt = payload.qualifiedAt;
      },
      () => {
        payload.artifacts['reader.bin'] = 'c'.repeat(64);
      },
    ]) {
      const before = structuredClone(payload);
      mutate();
      sign();
      expect(() => checkQualification(firmware, source, trust)).toThrow();
      payload = before;
    }
    sign();
    fs.appendFileSync(path.join(source, 'reader.bin'), 'tamper');
    expect(() => checkFirmwareQualification(firmware, source, trust)).toThrow();
    expect(() => checkQualification(firmware, source, trust)).toThrow();
  });
  it('rejects a signed image even when its production metadata was removed', () => {
    const image = Buffer.alloc(8192);
    image.writeUInt32LE(0x000002e7, 4096);
    fs.writeFileSync(path.join(source, 'reader.bin'), image);
    delete firmware.securityProfile;
    delete firmware.qualificationFile;
    expect(() => checkQualification(firmware, source, trust)).toThrow();
  });
  it('rejects paths and symlinks outside the artifact directory', () => {
    expect(() => checkQualification({ ...firmware, filename: '../secret.bin' }, source, trust)).toThrow();
    fs.unlinkSync(path.join(source, 'reader.bin'));
    fs.symlinkSync(trust, path.join(source, 'reader.bin'));
    expect(() => checkQualification(firmware, source, trust)).toThrow();
  });
  it('copies only catalog-listed bridge files and preserves existing assets on validation failure', () => {
    firmware.securityProfile = 'bridge';
    delete firmware.qualificationFile;
    fs.writeFileSync(path.join(source, 'firmwares.json'), JSON.stringify({ firmwares: [firmware] }));
    fs.writeFileSync(path.join(source, 'unlisted-production.bin'), 'not deployable');
    copyFirmwareAssets(destination, [{ path: source }]);
    expect(fs.existsSync(path.join(destination, 'reader.bin'))).toBe(true);
    expect(fs.existsSync(path.join(destination, 'unlisted-production.bin'))).toBe(false);
    firmware.securityProfile = 'production';
    fs.writeFileSync(path.join(source, 'firmwares.json'), JSON.stringify({ firmwares: [firmware] }));
    expect(() => copyFirmwareAssets(destination, [{ path: source }])).toThrow();
    expect(fs.existsSync(path.join(destination, 'reader.bin'))).toBe(true);
  });
});
