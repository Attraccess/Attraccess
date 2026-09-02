import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';
import { AppConfigType } from '../config/app.config';

const KEY_LENGTH_BYTES = 32; // AES-256
const IV_LENGTH_BYTES = 12; // Recommended for GCM
const AUTH_TAG_LENGTH_BYTES = 16; // 128-bit tag
export const TOKEN_VERSION = 'v1';

const SALT = Buffer.from('attraccess.encryption.salt', 'utf8');
const INFO = Buffer.from('attraccess|aes-256-gcm|content-encryption', 'utf8');

function deriveKey(secret: string, info = INFO): Buffer {
  const raw = typeof secret === 'string' ? secret.trim() : String(secret).trim();
  const derived = hkdfSync('sha256', Buffer.from(raw, 'utf8'), SALT, info, KEY_LENGTH_BYTES);
  return Buffer.from(derived as unknown as ArrayBuffer);
}

function encryptWithKey(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, ciphertext, authTag]);
  return `${TOKEN_VERSION}.${payload.toString('base64url')}`;
}

function decryptWithKey(key: Buffer, token: string): string {
  const [version, encoded] = token.split('.', 2);
  if (version !== TOKEN_VERSION || !encoded) throw new Error('decrypt: unsupported or malformed token');
  const payload = Buffer.from(encoded, 'base64url');
  if (payload.toString('base64url') !== encoded) throw new Error('decrypt: token payload not canonical');
  if (payload.length < IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES + 1) throw new Error('decrypt: token payload too short');
  const iv = payload.subarray(0, IV_LENGTH_BYTES);
  const authTag = payload.subarray(payload.length - AUTH_TAG_LENGTH_BYTES);
  const ciphertext = payload.subarray(IV_LENGTH_BYTES, payload.length - AUTH_TAG_LENGTH_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export interface StandaloneEncryptor {
  encrypt(plaintext: string): string;
  isEncrypted(value: string): boolean;
}

@Injectable()
export class EncryptionService {
  private cachedKey: Buffer | null = null;

  constructor(private readonly configService: ConfigService) { }

  /**
   * Factory for use in scripts or other contexts where Nest ConfigService is not available.
   * Uses the same key derivation and format as this service.
   */
  static createWithSecret(secret: string): StandaloneEncryptor {
    if (!secret || secret.length === 0) {
      throw new Error('Secret is required for encryption');
    }
    const key = deriveKey(secret);
    return {
      encrypt(plaintext: string): string {
        return encryptWithKey(key, plaintext);
      },
      isEncrypted(value: string): boolean {
        return typeof value === 'string' && value.startsWith(`${TOKEN_VERSION}.`);
      },
    };
  }

  private getEncryptionKey(): Buffer {
    if (this.cachedKey) return this.cachedKey;

    const appConfig = this.configService.get<AppConfigType>('app');
    const secret = appConfig?.AUTH_SESSION_SECRET;
    if (!secret || secret.length === 0) {
      throw new Error('AUTH_SESSION_SECRET is required for encryption');
    }

    this.cachedKey = deriveKey(secret);
    return this.cachedKey;
  }

  private getPluginEncryptionKey(pluginId: string): Buffer {
    const appConfig = this.configService.get<AppConfigType>('app');
    const secret = appConfig?.AUTH_SESSION_SECRET;
    if (!secret || secret.length === 0) throw new Error('AUTH_SESSION_SECRET is required for encryption');
    return deriveKey(secret, Buffer.from(`attraccess|aes-256-gcm|plugin-secret|${pluginId}`, 'utf8'));
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
    return encryptWithKey(this.getEncryptionKey(), plaintext);
  }

  decrypt(token: string): string {
    if (typeof token !== 'string' || token.length === 0) {
      throw new TypeError('decrypt: token must be a non-empty string');
    }

    return decryptWithKey(this.getEncryptionKey(), token);
  }

  encryptForPlugin(pluginId: string, plaintext: string): string {
    if (!pluginId || !/^[a-z0-9-]+$/.test(pluginId)) throw new Error('plugin ID is required for encryption');
    if (typeof plaintext !== 'string') throw new TypeError('encrypt: plaintext must be a string');
    return encryptWithKey(this.getPluginEncryptionKey(pluginId), plaintext);
  }

  decryptForPlugin(pluginId: string, token: string): string {
    if (!pluginId || !/^[a-z0-9-]+$/.test(pluginId)) throw new Error('plugin ID is required for decryption');
    if (typeof token !== 'string' || token.length === 0) throw new TypeError('decrypt: token must be a non-empty string');
    return decryptWithKey(this.getPluginEncryptionKey(pluginId), token);
  }
}
