import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDecipheriv } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { EncryptionService } from './encryption.service';
import { ConfigService } from '@nestjs/config';

describe('EncryptionService', () => {
  const originalSecret = process.env.AUTH_SESSION_SECRET;
  let service: EncryptionService;

  beforeEach(async () => {
    process.env.AUTH_SESSION_SECRET = 'test-secret-please-change-me';
    const moduleRef = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'app' ? { AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET } : undefined,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(EncryptionService);
  });

  afterAll(() => {
    process.env.AUTH_SESSION_SECRET = originalSecret;
  });

  it('should round-trip encrypt/decrypt a simple string', () => {
    const token = service.encrypt('hello world');
    const plain = service.decrypt(token);
    expect(plain).toBe('hello world');
  });

  it('should include version prefix v1', () => {
    const token = service.encrypt('data');
    expect(token.startsWith('v1.')).toBe(true);
  });

  it('should produce different ciphertexts for the same plaintext (random IV)', () => {
    const a = service.encrypt('same text');
    const b = service.encrypt('same text');
    expect(a).not.toEqual(b);
  });

  it('should use base64url-safe payload after the prefix', () => {
    const token = service.encrypt('payload');
    const [, payload] = token.split('.', 2);
    expect(/^[A-Za-z0-9_-]+$/.test(payload)).toBe(true);
  });

  it('should encrypt for generated base64url plugin IDs', () => {
    const pluginId = 'WILE7_rolkeNfuvPHfPs0';
    expect(service.decryptForPlugin(pluginId, service.encryptForPlugin(pluginId, 'plugin secret'))).toBe(
      'plugin secret',
    );
  });

  it('should fail decryption if token payload is tampered (auth tag mismatch)', () => {
    const token = service.encrypt('top secret');
    const [prefix, b64] = token.split('.', 2);
    // Flip the last character in a base64url-valid way to keep string valid
    const last = b64[b64.length - 1];
    const flipped = last === 'A' ? 'B' : 'A';
    const tampered = `${prefix}.${b64.slice(0, -1)}${flipped}`;
    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('should fail decryption with wrong secret', async () => {
    const token = service.encrypt('do not leak');
    process.env.AUTH_SESSION_SECRET = 'a-different-secret';
    const moduleRef = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'app' ? { AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET } : undefined,
          },
        },
      ],
    }).compile();
    const otherService = moduleRef.get(EncryptionService);
    expect(() => otherService.decrypt(token)).toThrow();
  });

  it('should reject malformed tokens (no version or bad format)', () => {
    expect(() => service.decrypt('')).toThrow();
    expect(() => service.decrypt('v1')).toThrow();
    expect(() => service.decrypt('v1.')).toThrow();
    expect(() => service.decrypt('v2.invalidbase64url')).toThrow();
  });
});

describe('card key envelopes', () => {
  let directory: string;
  let path: string;
  let service: EncryptionService;
  const context = { id: 12, uid: '04010203040506', keyNo: 2 };
  const cardKey = '0123456789abcdef0123456789abcdef';
  const keys = { old: Buffer.alloc(32, 1).toString('base64url'), current: Buffer.alloc(32, 2).toString('base64url') };

  function keyring(active: string, entries = keys) {
    writeFileSync(path, JSON.stringify({ active, keys: entries }), { mode: 0o600 });
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'attraccess-card-key-test-'));
    chmodSync(directory, 0o700);
    path = join(directory, 'keyring.json');
    keyring('old');
    service = new EncryptionService(
      new ConfigService({ app: { CARD_KEYRING_FILE: path, AUTH_SESSION_SECRET: 'legacy-test' } }),
    );
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('rewraps legacy plaintext and session-secret ciphertext without changing the card key', () => {
    for (const stored of [cardKey, service.encrypt(cardKey)]) {
      const wrapped = service.rewrapCardKey(context, stored);
      expect(wrapped).toMatch(/^card1\.old\./);
      expect(openEnvelope(wrapped)).toEqual(Buffer.from(cardKey, 'hex'));
      expect(service.rewrapCardKey(context, wrapped)).toBe(wrapped);
    }
  });

  function openEnvelope(envelope: string): Buffer {
    const [, id, encoded] = envelope.split('.');
    const bytes = Buffer.from(encoded, 'base64url');
    const fields = ['attraccess.card-key.v1', 'legacy-record', String(context.id), context.uid, String(context.keyNo)];
    const aad = Buffer.concat(
      fields.map((field) => {
        const body = Buffer.from(field);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(body.length);
        return Buffer.concat([length, body]);
      }),
    );
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keys[id], 'base64url'), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.concat([aad, Buffer.from(id)]));
    decipher.setAuthTag(bytes.subarray(28));
    return Buffer.concat([decipher.update(bytes.subarray(12, 28)), decipher.final()]);
  }

  it('rotates wrapping keys and supports a separately restored old keyring', () => {
    const old = service.encryptCardKey(context, cardKey);
    keyring('current');
    const current = service.rewrapCardKey(context, old);
    expect(current).toMatch(/^card1\.current\./);
    expect(openEnvelope(current)).toEqual(Buffer.from(cardKey, 'hex'));
    keyring('old');
    expect(openEnvelope(service.rewrapCardKey(context, current))).toEqual(Buffer.from(cardKey, 'hex'));
  });

  it.each([
    { ...context, id: 13 },
    { ...context, uid: '04010203040507' },
    { ...context, keyNo: 3 },
  ])('rejects substitution of the card record context %j', (other) => {
    const wrapped = service.encryptCardKey(context, cardKey);
    expect(() => service.rewrapCardKey(other, wrapped)).toThrow();
  });

  it('rejects corruption, unknown keys and noncanonical encodings', () => {
    const wrapped = service.encryptCardKey(context, cardKey);
    const parts = wrapped.split('.');
    const bytes = Buffer.from(parts[2], 'base64url');
    bytes[12] ^= 1;
    expect(() => service.rewrapCardKey(context, `${parts[0]}.${parts[1]}.${bytes.toString('base64url')}`)).toThrow();
    expect(() => service.rewrapCardKey(context, wrapped.replace('.old.', '.missing.'))).toThrow();
    expect(() => service.rewrapCardKey(context, wrapped + '=')).toThrow();
    expect(() => service.rewrapCardKey(context, 'card2.invalid')).toThrow();
  });

  it('requires protected keyring permissions and complete valid key material', () => {
    chmodSync(path, 0o644);
    expect(() => service.encryptCardKey(context, cardKey)).toThrow('Unsafe card keyring');
    chmodSync(path, 0o600);
    chmodSync(directory, 0o755);
    expect(() => service.encryptCardKey(context, cardKey)).toThrow('Unsafe card keyring');
    chmodSync(directory, 0o700);
    writeFileSync(path, JSON.stringify({ active: 'bad', keys: { bad: 'short' } }));
    expect(() => service.encryptCardKey(context, cardKey)).toThrow('Invalid card keyring');
  });

  it('uses independent IVs and denies writes without a configured keyring', () => {
    expect(service.encryptCardKey(context, cardKey)).not.toEqual(service.encryptCardKey(context, cardKey));
    const unconfigured = new EncryptionService(new ConfigService({ app: { AUTH_SESSION_SECRET: 'legacy-test' } }));
    expect(() => unconfigured.encryptCardKey(context, cardKey)).toThrow('Card keyring is not configured');
  });
});
