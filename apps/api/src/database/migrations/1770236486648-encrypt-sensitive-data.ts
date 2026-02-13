import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

// Self-contained encryption logic; must match EncryptionService format (v1. + base64url payload).
// Kept inline so this migration stays idempotent and independent of app code changes.
const TOKEN_VERSION = 'v1';
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const SALT = Buffer.from('attraccess.encryption.salt', 'utf8');
const INFO = Buffer.from('attraccess|aes-256-gcm|content-encryption', 'utf8');

function getKey(secret: string): Buffer {
  const raw = typeof secret === 'string' ? secret.trim() : String(secret).trim();
  const derived = hkdfSync(
    'sha256',
    Buffer.from(raw, 'utf8'),
    SALT,
    INFO,
    KEY_LENGTH_BYTES
  );
  return Buffer.isBuffer(derived) ? derived : Buffer.from(derived);
}

function encryptPlaintext(secret: string, plaintext: string): string {
  const key = getKey(secret);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, ciphertext, authTag]);
  return `${TOKEN_VERSION}.${payload.toString('base64url')}`;
}

function decryptCiphertext(secret: string, token: string): string {
  const raw = typeof token === 'string' ? token.trim() : String(token).trim();
  const [version, encoded] = raw.split('.', 2);
  if (version !== TOKEN_VERSION || !encoded) {
    throw new Error('decrypt: unsupported or malformed token');
  }
  const payload = Buffer.from(encoded, 'base64url');
  const canonical = payload.toString('base64url');
  if (canonical !== encoded) {
    throw new Error('decrypt: token payload not canonical');
  }
  if (payload.length < IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES + 1) {
    throw new Error('decrypt: token payload too short');
  }
  const iv = payload.subarray(0, IV_LENGTH_BYTES);
  const authTag = payload.subarray(payload.length - AUTH_TAG_LENGTH_BYTES);
  const ciphertext = payload.subarray(IV_LENGTH_BYTES, payload.length - AUTH_TAG_LENGTH_BYTES);
  const key = getKey(secret);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * One-time data migration: encrypt any plaintext sensitive values that were
 * stored before encryption was enforced. After this runs, read paths only
 * need to decrypt (no DB writes on read).
 */
export class EncryptSensitiveData1770236486648 implements MigrationInterface {
  name = 'EncryptSensitiveData1770236486648';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const raw = process.env.AUTH_SESSION_SECRET;
    const secret = typeof raw === 'string' ? raw.trim() : '';
    if (!secret) {
      return;
    }

    const encryptColumn = async (
      table: string,
      idColumn: string,
      valueColumn: string
    ): Promise<void> => {
      const rows = await queryRunner.query(
        `SELECT "${idColumn}" as id, "${valueColumn}" as val FROM "${table}" WHERE "${valueColumn}" IS NOT NULL AND "${valueColumn}" != '' AND "${valueColumn}" NOT LIKE 'v1.%'`
      );
      for (const row of rows) {
        const encrypted = encryptPlaintext(secret, row.val);
        await queryRunner.query(
          `UPDATE "${table}" SET "${valueColumn}" = ? WHERE "${idColumn}" = ?`,
          [encrypted, row.id]
        );
      }
    };

    await encryptColumn('nfc_card', 'id', 'key');
    await encryptColumn('mqtt_server', 'id', 'password');
    await encryptColumn('sso_provider_oidc_configuration', 'id', 'clientSecret');
    await encryptColumn('sso_provider_saml_configuration', 'id', 'provisioningSecret');
    await encryptColumn('authentication_detail', 'id', 'totpSecret');
    await encryptColumn('user', 'id', 'nfcKeySeedToken');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const raw = process.env.AUTH_SESSION_SECRET;
    const secret = typeof raw === 'string' ? raw.trim() : '';
    if (!secret) {
      throw new Error('AUTH_SESSION_SECRET is required to run the down migration');
    }

    const skipped: string[] = [];

    const decryptColumn = async (
      table: string,
      idColumn: string,
      valueColumn: string
    ): Promise<void> => {
      const rows = await queryRunner.query(
        `SELECT "${idColumn}" as id, "${valueColumn}" as val FROM "${table}" WHERE "${valueColumn}" IS NOT NULL AND "${valueColumn}" LIKE 'v1.%'`
      );
      for (const row of rows) {
        const val = row.val != null ? String(row.val).trim() : '';
        if (!val) continue;
        let decrypted: string;
        try {
          decrypted = decryptCiphertext(secret, val);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // GCM auth-tag failure → key mismatch (e.g. value was encrypted by app with different env).
          // Skip this row so revert can complete; value stays encrypted and the app will still decrypt it at runtime.
          if (
            /unable to authenticate|Unsupported state|auth tag|EAUTH/.test(msg)
          ) {
            skipped.push(`${table}.${valueColumn}(id=${row.id})`);
            continue;
          }
          throw err;
        }
        await queryRunner.query(
          `UPDATE "${table}" SET "${valueColumn}" = ? WHERE "${idColumn}" = ?`,
          [decrypted, row.id]
        );
      }
    };

    await decryptColumn('nfc_card', 'id', 'key');
    await decryptColumn('mqtt_server', 'id', 'password');
    await decryptColumn('sso_provider_oidc_configuration', 'id', 'clientSecret');
    await decryptColumn('sso_provider_saml_configuration', 'id', 'provisioningSecret');
    await decryptColumn('authentication_detail', 'id', 'totpSecret');
    await decryptColumn('user', 'id', 'nfcKeySeedToken');

    if (skipped.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        'EncryptSensitiveData down: skipped %d row(s) that could not be decrypted (key mismatch; likely encrypted by app with different AUTH_SESSION_SECRET): %s. They remain encrypted;',
        skipped.length,
        skipped.join(', ')
      );
    }
  }
}
