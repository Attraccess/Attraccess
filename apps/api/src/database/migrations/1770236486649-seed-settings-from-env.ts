import { createCipheriv, hkdfSync, randomBytes } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

const APP_PARENT = 'app';
const SMTP_PARENT = 'smtp';

const APP_KEYS = {
  frontendUrl: 'frontend_url',
  backendUrl: 'backend_url',
  publicInternetUrl: 'public_internet_url',
  licenseKey: 'license_key',
} as const;

const SMTP_KEYS = {
  service: 'service',
  host: 'host',
  port: 'port',
  secure: 'secure',
  user: 'user',
  pass: 'pass',
  from: 'from',
} as const;

const TOKEN_VERSION = 'v1';
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;

export class SeedSettingsFromEnv1770236486649 implements MigrationInterface {
  name = 'SeedSettingsFromEnv1770236486649';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Only seed when no app/smtp settings exist to avoid overwriting existing configuration.
    const [{ count }] = await queryRunner.query(`SELECT COUNT(*) as count FROM "setting" WHERE "parent" IN (?, ?)`, [
      APP_PARENT,
      SMTP_PARENT,
    ]);
    if (Number(count) > 0) {
      return;
    }

    const settings = [...appSettingsFromEnv(), ...smtpSettingsFromEnv()];

    for (const setting of settings) {
      await queryRunner.query(`INSERT INTO "setting" ("parent", "key", "value") VALUES (?, ?, ?)`, [
        setting.parent,
        setting.key,
        setting.value,
      ]);
    }
  }

  public async down(): Promise<void> {
    // Intentionally left empty; seeded settings should remain intact on rollback.
  }
}

type SeedSetting = { parent: string; key: string; value: string };

function appSettingsFromEnv(): SeedSetting[] {
  const frontendUrl = normalizeString(
    process.env.ATTRACCESS_FRONTEND_URL ??
      process.env.FRONTEND_URL ??
      process.env.ATTRACCESS_URL ??
      process.env.VITE_ATTRACCESS_URL,
  );
  const backendUrl = normalizeString(process.env.ATTRACCESS_URL ?? process.env.VITE_ATTRACCESS_URL);
  const publicInternetUrl = normalizeString(process.env.ATTRACCESS_PUBLIC_INTERNET_URL ?? backendUrl);
  const licenseKey = normalizeString(process.env.LICENSE_KEY);
  return presentSettings(APP_PARENT, [
    [APP_KEYS.frontendUrl, frontendUrl],
    [APP_KEYS.backendUrl, backendUrl],
    [APP_KEYS.publicInternetUrl, publicInternetUrl],
    [APP_KEYS.licenseKey, licenseKey ? encryptSecret(licenseKey) : null],
  ]);
}

function smtpSettingsFromEnv(): SeedSetting[] {
  const password = normalizeString(process.env.SMTP_PASS);
  return presentSettings(SMTP_PARENT, [
    [SMTP_KEYS.service, normalizeString(process.env.SMTP_SERVICE)],
    [SMTP_KEYS.host, normalizeString(process.env.SMTP_HOST)],
    [SMTP_KEYS.port, normalizeString(process.env.SMTP_PORT)],
    [SMTP_KEYS.secure, normalizeString(process.env.SMTP_SECURE)],
    [SMTP_KEYS.user, normalizeString(process.env.SMTP_USER)],
    [SMTP_KEYS.pass, password ? encryptSecret(password) : null],
    [SMTP_KEYS.from, normalizeString(process.env.SMTP_FROM)],
  ]);
}

function presentSettings(parent: string, values: [string, string | null][]): SeedSetting[] {
  return values.flatMap(([key, value]) => (value ? [{ parent, key, value }] : []));
}

const normalizeString = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const encryptSecret = (plaintext: string): string => {
  const secret = normalizeString(process.env.AUTH_SESSION_SECRET ?? null);
  if (!secret) {
    throw new Error('AUTH_SESSION_SECRET is required to encrypt settings secrets');
  }

  const salt = Buffer.from('attraccess.encryption.salt', 'utf8');
  const info = Buffer.from('attraccess|aes-256-gcm|content-encryption', 'utf8');
  const key = Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), salt, info, KEY_LENGTH_BYTES));

  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, ciphertext, authTag]);

  return `${TOKEN_VERSION}.${payload.toString('base64url')}`;
};
