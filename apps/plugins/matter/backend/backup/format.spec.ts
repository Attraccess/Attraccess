import { COMPATIBILITY_TABLE, STORAGE_SCHEMA_VERSION } from '@attraccess/matter-contract';
import { createHash, randomBytes } from 'node:crypto';
import {
  BackupFormatError,
  BackupIncompatibleError,
  MAGIC,
  assertCompatible,
  canonicalJson,
  decryptBackup,
  encryptBackup,
  readHeader,
  type BackupBody,
  type FileHeader,
} from './format';
import {
  InvalidRecoveryKeyError,
  formatRecoveryKey,
  generateRecoveryKey,
  parseRecoveryKey,
  recoveryKeyId,
} from './recovery-key';

const entry = COMPATIBILITY_TABLE[0];
const payload = Buffer.from('{"secret":"fabric-keys-live-here"}');

const body = (): BackupBody => ({
  sidecar: {
    header: {
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      sidecarVersion: entry.sidecar,
      matterJsVersion: entry.matterJs,
      fabricId: '1234',
      rootCertFingerprint: 'ab'.repeat(32),
      fabricGeneration: 3,
      storageInstanceId: '3f2c8a0e-6b7d-4c19-9d3f-0a1b2c3d4e5f',
      payloadSha256: createHash('sha256').update(payload).digest('hex'),
      payloadBytes: payload.length,
      createdAt: '2026-11-01T10:00:00.000Z',
    },
    payload: payload.toString('base64'),
  },
  tables: {
    plugin_matter_fabrics: [{ id: 'f1', fabric_id: '1234', label: 'Attraccess' }],
    plugin_matter_nodes: [{ id: 'n1', node_id: '5', reachable: 1 }],
  },
});
const meta = { pluginVersion: entry.plugin, pluginMigration: 'CreateMatterBackup1793900002000' };

const flip = (file: Buffer, index: number) => {
  const copy = Buffer.from(file);
  copy[index] ^= 0x01;
  return copy;
};
const headerEnd = (file: Buffer) => 12 + file.readUInt32BE(8);
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof BackupFormatError ? error.code : `unexpected:${String(error)}`;
  }
  return 'no error';
};

describe('recovery key', () => {
  it('is 32 random bytes shown as grouped uppercase base32 and parsed back leniently', () => {
    const key = generateRecoveryKey();
    const text = formatRecoveryKey(key);
    expect(key).toHaveLength(32);
    expect(text).toMatch(/^([A-Z2-7]{4}-){12}[A-Z2-7]{4}$/);
    expect(parseRecoveryKey(text).equals(key)).toBe(true);
    expect(parseRecoveryKey(text.toLowerCase().replace(/-/g, ' ')).equals(key)).toBe(true);
    expect(recoveryKeyId(key)).toMatch(/^[0-9a-f]{16}$/);
    expect(recoveryKeyId(key)).toBe(createHash('sha256').update(key).digest('hex').slice(0, 16));
  });

  it('rejects anything that is not a key', () => {
    const text = formatRecoveryKey(generateRecoveryKey());
    for (const bad of ['', 'ABCD', text.slice(0, -1), `${text}A`, text.replace(/^./, '1'), text.replace(/^./, '!')]) {
      expect(() => parseRecoveryKey(bad)).toThrow(InvalidRecoveryKeyError);
    }
  });

  it('generates a different key every time', () => {
    expect(generateRecoveryKey().equals(generateRecoveryKey())).toBe(false);
  });
});

describe('backup file format', () => {
  const key = generateRecoveryKey();

  it('round-trips the sidecar snapshot and every table', () => {
    const file = encryptBackup(body(), meta, key);
    expect(file.subarray(0, 8).equals(MAGIC)).toBe(true);
    const out = decryptBackup(file, key);
    expect(out.body).toEqual(body());
    expect(out.header).toMatchObject({
      formatVersion: 1,
      pluginVersion: entry.plugin,
      sidecarVersion: entry.sidecar,
      matterJsVersion: entry.matterJs,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      pluginMigration: meta.pluginMigration,
      fabricId: '1234',
      fabricGeneration: 3,
      recoveryKeyId: recoveryKeyId(key),
    });
    expect(readHeader(file)).toEqual(out.header);
  });

  it('keeps no plaintext of the snapshot or the tables in the file, and never the key', () => {
    const file = encryptBackup(body(), meta, key);
    const text = file.toString('latin1');
    expect(text).not.toContain('fabric-keys-live-here');
    expect(text).not.toContain(payload.toString('base64'));
    expect(text).not.toContain('Attraccess');
    expect(file.includes(key)).toBe(false);
    expect(text).not.toContain(formatRecoveryKey(key));
  });

  it('digests sections over canonical JSON, whatever the key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 1, c: 2 } })).toBe(canonicalJson({ a: { c: 2, d: 1 }, b: 1 }));
    const header = readHeader(encryptBackup(body(), meta, key));
    expect(header.sections.pluginTables).toBe(createHash('sha256').update(canonicalJson(body().tables)).digest('hex'));
  });

  it('uses a fresh salt and IV for every file', () => {
    const a = readHeader(encryptBackup(body(), meta, key));
    const b = readHeader(encryptBackup(body(), meta, key));
    expect(a.kdfSalt).not.toBe(b.kdfSalt);
    expect(a.iv).not.toBe(b.iv);
  });

  it('rejects a wrong key', () => {
    const file = encryptBackup(body(), meta, key);
    expect(code(() => decryptBackup(file, generateRecoveryKey()))).toBe('wrong_key');
    expect(code(() => decryptBackup(file, randomBytes(8)))).toBe('wrong_key');
  });

  it('rejects truncation anywhere', () => {
    const file = encryptBackup(body(), meta, key);
    expect(code(() => decryptBackup(Buffer.alloc(0), key))).toBe('truncated');
    expect(code(() => decryptBackup(file.subarray(0, 9), key))).toBe('truncated');
    expect(code(() => decryptBackup(file.subarray(0, headerEnd(file) - 5), key))).toBe('truncated');
    expect(code(() => decryptBackup(file.subarray(0, file.length - 1), key))).toBe('truncated');
    expect(code(() => decryptBackup(file.subarray(0, headerEnd(file) + 20), key))).toBe('truncated');
  });

  it('rejects trailing data', () => {
    const file = encryptBackup(body(), meta, key);
    expect(code(() => decryptBackup(Buffer.concat([file, Buffer.from('x')]), key))).toBe('corrupt');
  });

  it('rejects a flipped bit anywhere in the header', () => {
    const file = encryptBackup(body(), meta, key);
    const end = headerEnd(file);
    let rejected = 0;
    for (let index = 12; index < end; index += 1) {
      const result = code(() => decryptBackup(flip(file, index), key));
      expect(['corrupt', 'wrong_key', 'incompatible_format', 'truncated']).toContain(result);
      rejected += 1;
    }
    expect(rejected).toBe(end - 12);
  });

  it('rejects a flipped bit in the magic, the length, the body and the tag', () => {
    const file = encryptBackup(body(), meta, key);
    expect(code(() => decryptBackup(flip(file, 0), key))).toBe('incompatible_format');
    expect(['corrupt', 'truncated']).toContain(code(() => decryptBackup(flip(file, 11), key)));
    for (const index of [headerEnd(file), headerEnd(file) + 17, file.length - 20, file.length - 1]) {
      expect(code(() => decryptBackup(flip(file, index), key))).toBe('corrupt');
    }
  });

  it('rejects a header whose fields were changed and re-serialized, even with a valid JSON shape', () => {
    const file = encryptBackup(body(), meta, key);
    const header = JSON.parse(file.subarray(12, headerEnd(file)).toString()) as FileHeader;
    header.fabricGeneration = 99;
    const edited = Buffer.from(JSON.stringify(header));
    const length = Buffer.alloc(4);
    length.writeUInt32BE(edited.length);
    const forged = Buffer.concat([file.subarray(0, 8), length, edited, file.subarray(headerEnd(file))]);
    expect(code(() => decryptBackup(forged, key))).toBe('corrupt');
  });

  it('marks a backup whose tables do not belong to its snapshot in the authenticated header only', () => {
    const consistent = encryptBackup(body(), { ...meta, consistent: true }, key);
    expect(readHeader(consistent)).not.toHaveProperty('consistent');
    expect(decryptBackup(consistent, key).header).not.toHaveProperty('consistent');

    const marked = encryptBackup(body(), { ...meta, consistent: false }, key);
    expect(readHeader(marked).consistent).toBe(false);
    expect(decryptBackup(marked, key).header.consistent).toBe(false);

    // Dropping the mark (to pass the backup off as consistent) breaks the authentication.
    const header = JSON.parse(marked.subarray(12, headerEnd(marked)).toString()) as FileHeader;
    delete header.consistent;
    const edited = Buffer.from(JSON.stringify(header));
    const length = Buffer.alloc(4);
    length.writeUInt32BE(edited.length);
    const forged = Buffer.concat([marked.subarray(0, 8), length, edited, marked.subarray(headerEnd(marked))]);
    expect(readHeader(forged)).not.toHaveProperty('consistent');
    expect(code(() => decryptBackup(forged, key))).toBe('corrupt');
  });

  it('rejects another format version', () => {
    const file = encryptBackup(body(), meta, key);
    const header = JSON.parse(file.subarray(12, headerEnd(file)).toString());
    header.formatVersion = 2;
    const edited = Buffer.from(JSON.stringify(header));
    const length = Buffer.alloc(4);
    length.writeUInt32BE(edited.length);
    const other = Buffer.concat([file.subarray(0, 8), length, edited, file.subarray(headerEnd(file))]);
    expect(code(() => decryptBackup(other, key))).toBe('incompatible_format');
    expect(code(() => readHeader(other))).toBe('incompatible_format');
    expect(code(() => decryptBackup(Buffer.from('this is some other file, not a backup at all'), key))).toBe(
      'incompatible_format',
    );
  });

  it('rejects a body that does not match the header it was sealed with', () => {
    // Sealed correctly, but the inner snapshot claims another generation than the header.
    const inconsistent = body();
    const file = encryptBackup(inconsistent, meta, key);
    const header = readHeader(file);
    expect(header.fabricGeneration).toBe(3);
    inconsistent.sidecar.header.payloadSha256 = '0'.repeat(64);
    expect(code(() => decryptBackup(encryptBackup(inconsistent, meta, key), key))).toBe('corrupt');
  });
});

describe('backup compatibility', () => {
  const header = (overrides: Partial<FileHeader> = {}): FileHeader => ({
    ...readHeader(encryptBackup(body(), meta, generateRecoveryKey())),
    ...overrides,
  });
  const local = { pluginMigration: meta.pluginMigration };
  const reason = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      return error instanceof BackupIncompatibleError ? error.code : 'unexpected';
    }
    return null;
  };

  it('accepts the same schema, migration and a listed release combination', () => {
    expect(reason(() => assertCompatible(header(), local))).toBeNull();
  });

  it('refuses another storage schema, plugin migration, or an unlisted release', () => {
    expect(reason(() => assertCompatible(header({ storageSchemaVersion: 2 }), local))).toBe('incompatible_schema');
    expect(reason(() => assertCompatible(header(), { pluginMigration: 'Newer1999999999999' }))).toBe(
      'incompatible_migration',
    );
    expect(reason(() => assertCompatible(header(), { pluginMigration: null }))).toBe('incompatible_migration');
    expect(reason(() => assertCompatible(header({ pluginVersion: '0.1.0' }), local))).toBe('incompatible_version');
    expect(reason(() => assertCompatible(header({ sidecarVersion: '9.9.9' }), local))).toBe('incompatible_version');
    expect(reason(() => assertCompatible(header({ matterJsVersion: '0.0.1' }), local))).toBe('incompatible_version');
  });
});
