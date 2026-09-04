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
    expect(service.decryptForPlugin(pluginId, service.encryptForPlugin(pluginId, 'plugin secret'))).toBe('plugin secret');
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
