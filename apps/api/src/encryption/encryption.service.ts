import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';
import { constants, closeSync, fstatSync, openSync, readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
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

export interface LegacyCardKeyContext {
  id: number;
  uid: string;
  keyNo: number;
}

function cardContext(context: LegacyCardKeyContext): Buffer {
  if (
    !context ||
    !Number.isSafeInteger(context.id) ||
    context.id <= 0 ||
    !/^[0-9a-f]+$/i.test(context.uid) ||
    context.uid.length > 64 ||
    !Number.isSafeInteger(context.keyNo) ||
    context.keyNo < 0 ||
    context.keyNo > 255
  )
    throw new Error('Invalid card record context');
  const fields = ['attraccess.card-key.v1', 'legacy-record', String(context.id), context.uid, String(context.keyNo)];
  return Buffer.concat(
    fields.map((field) => {
      const bytes = Buffer.from(field, 'utf8');
      const length = Buffer.alloc(4);
      length.writeUInt32BE(bytes.length);
      return Buffer.concat([length, bytes]);
    }),
  );
}

export interface StandaloneEncryptor {
  encrypt(plaintext: string): string;
  isEncrypted(value: string): boolean;
}

@Injectable()
export class EncryptionService {
  private cachedKey: Buffer | null = null;

  constructor(private readonly configService: ConfigService) {}

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

  private cardKeyring(): { active: string; keys: Map<string, Buffer> } {
    const path = this.configService.get<AppConfigType>('app')?.CARD_KEYRING_FILE;
    if (!path) throw new Error('Card keyring is not configured');
    const directory = statSync(dirname(path));
    if (!directory.isDirectory() || directory.mode & 0o077 || directory.uid !== process.getuid())
      throw new Error('Unsafe card keyring directory');
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.uid !== process.getuid() || stat.mode & 0o077 || stat.size > 4096)
        throw new Error('Unsafe card keyring file');
      const encoded = readFileSync(fd);
      try {
        let value;
        try {
          value = JSON.parse(encoded.toString('utf8'));
        } catch {
          throw new Error('Invalid card keyring');
        }
        if (!value || typeof value.active !== 'string' || !value.keys || Array.isArray(value.keys))
          throw new Error('Invalid card keyring');
        const keys = new Map<string, Buffer>();
        try {
          for (const [id, text] of Object.entries(value.keys)) {
            if (!/^[A-Za-z0-9_-]{1,32}$/.test(id) || typeof text !== 'string') throw new Error('Invalid card keyring');
            const key = Buffer.from(text, 'base64url');
            if (key.length !== 32 || key.toString('base64url') !== text) {
              key.fill(0);
              throw new Error('Invalid card keyring');
            }
            keys.set(id, key);
          }
          if (!keys.has(value.active)) throw new Error('Missing active card key');
          return { active: value.active, keys };
        } catch (error) {
          for (const key of keys.values()) key.fill(0);
          throw error;
        }
      } finally {
        encoded.fill(0);
      }
    } finally {
      closeSync(fd);
    }
  }

  encryptCardKey(context: LegacyCardKeyContext, plaintext: string): string {
    if (!/^[0-9a-f]{32}$/i.test(plaintext)) throw new Error('Invalid card key');
    const aad = cardContext(context);
    const ring = this.cardKeyring();
    const raw = Buffer.from(plaintext, 'hex');
    try {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', ring.keys.get(ring.active), iv);
      // Bind the selected wrapping key as well as the immutable card record.
      cipher.setAAD(Buffer.concat([aad, Buffer.from(ring.active)]));
      const encrypted = Buffer.concat([cipher.update(raw), cipher.final()]);
      return `card1.${ring.active}.${Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString('base64url')}`;
    } finally {
      raw.fill(0);
      for (const key of ring.keys.values()) key.fill(0);
    }
  }

  /** Local migration only: returns another ciphertext, never a card key. */
  rewrapCardKey(context: LegacyCardKeyContext, stored: string): string {
    const aad = cardContext(context);
    if (!stored.startsWith('card1.')) {
      const legacy = stored.startsWith('v1.') ? this.decrypt(stored) : stored;
      return this.encryptCardKey(context, legacy);
    }
    const parts = stored.split('.');
    const ring = this.cardKeyring();
    let plaintext: Buffer | undefined;
    try {
      if (parts.length !== 3 || !ring.keys.has(parts[1])) throw new Error('Unknown card wrapping key');
      const bytes = Buffer.from(parts[2], 'base64url');
      if (bytes.length !== 44 || bytes.toString('base64url') !== parts[2]) throw new Error('Invalid card envelope');
      const decipher = createDecipheriv('aes-256-gcm', ring.keys.get(parts[1]), bytes.subarray(0, 12));
      decipher.setAAD(Buffer.concat([aad, Buffer.from(parts[1])]));
      decipher.setAuthTag(bytes.subarray(28));
      const first = decipher.update(bytes.subarray(12, 28));
      try {
        plaintext = Buffer.concat([first, decipher.final()]);
      } finally {
        first.fill(0);
      }
      // Validating even the current envelope detects corruption on repeated runs.
      if (parts[1] === ring.active) return stored;
      return this.encryptCardKey(context, plaintext.toString('hex'));
    } finally {
      plaintext?.fill(0);
      for (const key of ring.keys.values()) key.fill(0);
    }
  }

  encryptForPlugin(pluginId: string, plaintext: string): string {
    if (!pluginId || !/^[A-Za-z0-9_-]+$/.test(pluginId)) throw new Error('plugin ID is required for encryption');
    if (typeof plaintext !== 'string') throw new TypeError('encrypt: plaintext must be a string');
    return encryptWithKey(this.getPluginEncryptionKey(pluginId), plaintext);
  }

  decryptForPlugin(pluginId: string, token: string): string {
    if (!pluginId || !/^[A-Za-z0-9_-]+$/.test(pluginId)) throw new Error('plugin ID is required for decryption');
    if (typeof token !== 'string' || token.length === 0)
      throw new TypeError('decrypt: token must be a non-empty string');
    return decryptWithKey(this.getPluginEncryptionKey(pluginId), token);
  }
}
