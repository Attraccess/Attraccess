import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';
import { AppConfigType } from '../config/app.config';

const KEY_LENGTH_BYTES = 32; // AES-256
const IV_LENGTH_BYTES = 12; // Recommended for GCM
const AUTH_TAG_LENGTH_BYTES = 16; // 128-bit tag
const TOKEN_VERSION = 'v1';

@Injectable()
export class EncryptionService {
  private cachedKey: Buffer | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getEncryptionKey(): Buffer {
    if (this.cachedKey) return this.cachedKey;

    const appConfig = this.configService.get<AppConfigType>('app');
    const secret = appConfig?.AUTH_SESSION_SECRET;
    if (!secret || secret.length === 0) {
      throw new Error('AUTH_SESSION_SECRET is required for encryption');
    }

    const salt = Buffer.from('attraccess.encryption.salt', 'utf8');
    const info = Buffer.from('attraccess|aes-256-gcm|content-encryption', 'utf8');

    const derived = hkdfSync('sha256', Buffer.from(secret, 'utf8'), salt, info, KEY_LENGTH_BYTES);
    this.cachedKey = Buffer.from(derived as unknown as ArrayBuffer);
    return this.cachedKey;
  }

  private encodeBase64Url(buffer: Buffer): string {
    return buffer.toString('base64url');
  }

  private decodeBase64Url(input: string): Buffer {
    return Buffer.from(input, 'base64url');
  }

  isEncrypted(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.startsWith(`${TOKEN_VERSION}.`);
  }

  encryptIfPlain(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (this.isEncrypted(value)) {
      return value;
    }
    return this.encrypt(value);
  }

  decryptIfEncrypted(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (!this.isEncrypted(value)) {
      return value;
    }
    return this.decrypt(value);
  }

  encrypt(plaintext: string): string {
    if (typeof plaintext !== 'string') {
      throw new TypeError('encrypt: plaintext must be a string');
    }

    const key = this.getEncryptionKey();
    const iv = randomBytes(IV_LENGTH_BYTES);

    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const payload = Buffer.concat([iv, ciphertext, authTag]);
    return `${TOKEN_VERSION}.${this.encodeBase64Url(payload)}`;
  }

  decrypt(token: string): string {
    if (typeof token !== 'string' || token.length === 0) {
      throw new TypeError('decrypt: token must be a non-empty string');
    }

    const [version, encoded] = token.split('.', 2);
    if (version !== TOKEN_VERSION || !encoded) {
      throw new Error('decrypt: unsupported or malformed token');
    }

    const payload = this.decodeBase64Url(encoded);
    // Enforce canonical base64url encoding to prevent alternate encodings of the same bytes
    // from being accepted as valid tokens (guards against non-canonical tampering).
    const canonical = this.encodeBase64Url(payload);
    if (canonical !== encoded) {
      throw new Error('decrypt: token payload not canonical');
    }
    if (payload.length < IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES + 1) {
      throw new Error('decrypt: token payload too short');
    }

    const iv = payload.subarray(0, IV_LENGTH_BYTES);
    const authTag = payload.subarray(payload.length - AUTH_TAG_LENGTH_BYTES);
    const ciphertext = payload.subarray(IV_LENGTH_BYTES, payload.length - AUTH_TAG_LENGTH_BYTES);

    const key = this.getEncryptionKey();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return plaintext;
  }
}
