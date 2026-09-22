import { createDecipheriv, hkdfSync } from 'crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { SeedSettingsFromEnv1770236486649 } from './1770236486649-seed-settings-from-env';

describe('environment settings migration', () => {
  let source: DataSource;
  let runner: QueryRunner;
  const originalEnv = process.env;
  const migration = new SeedSettingsFromEnv1770236486649();
  beforeEach(async () => {
    process.env = { AUTH_SESSION_SECRET: 'migration-test-secret' };
    source = await new DataSource({ type: 'sqlite', database: ':memory:', entities: [] }).initialize();
    runner = source.createQueryRunner();
    await runner.query('CREATE TABLE setting (parent TEXT, key TEXT, value TEXT)');
  });
  afterEach(async () => {
    process.env = originalEnv;
    await runner.release();
    await source.destroy();
  });
  const decrypt = (token: string) => {
    expect(token).toMatch(/^v1\./);
    const payload = Buffer.from(token.slice(3), 'base64url');
    const key = Buffer.from(
      hkdfSync(
        'sha256',
        Buffer.from('migration-test-secret'),
        Buffer.from('attraccess.encryption.salt'),
        Buffer.from('attraccess|aes-256-gcm|content-encryption'),
        32,
      ),
    );
    const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(-16));
    return Buffer.concat([decipher.update(payload.subarray(12, -16)), decipher.final()]).toString();
  };
  it('seeds normalized URLs and SMTP configuration while encrypting secrets compatibly', async () => {
    Object.assign(process.env, {
      ATTRACCESS_FRONTEND_URL: ' https://front.example ',
      FRONTEND_URL: 'https://unused.example',
      ATTRACCESS_URL: ' https://api.example ',
      LICENSE_KEY: ' license ',
      SMTP_SERVICE: 'mail',
      SMTP_HOST: 'smtp.example',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'sender',
      SMTP_PASS: ' password ',
      SMTP_FROM: 'sender@example.com',
    });
    await migration.up(runner);
    const rows: { parent: string; key: string; value: string }[] = await runner.query('SELECT * FROM setting');
    expect(rows).toHaveLength(11);
    const values = Object.fromEntries(rows.map((row) => [`${row.parent}.${row.key}`, row.value]));
    expect(values).toMatchObject({
      'app.frontend_url': 'https://front.example',
      'app.backend_url': 'https://api.example',
      'app.public_internet_url': 'https://api.example',
      'smtp.secure': 'false',
      'smtp.port': '587',
      'smtp.from': 'sender@example.com',
    });
    expect(decrypt(values['app.license_key'])).toBe('license');
    expect(decrypt(values['smtp.pass'])).toBe('password');
    await migration.down();
    expect(await runner.query('SELECT * FROM setting')).toEqual(rows);
  });
  it('preserves an existing configuration without requiring an encryption key', async () => {
    delete process.env.AUTH_SESSION_SECRET;
    process.env.LICENSE_KEY = 'new-license';
    await runner.query("INSERT INTO setting VALUES ('smtp', 'host', 'existing')");
    await migration.up(runner);
    expect(await runner.query('SELECT * FROM setting')).toEqual([{ parent: 'smtp', key: 'host', value: 'existing' }]);
  });
  it('uses legacy URL fallbacks and omits whitespace-only optional values', async () => {
    Object.assign(process.env, { VITE_ATTRACCESS_URL: 'https://legacy.example', SMTP_HOST: '  ', LICENSE_KEY: '' });
    await migration.up(runner);
    expect(await runner.query('SELECT key, value FROM setting')).toEqual([
      { key: 'frontend_url', value: 'https://legacy.example' },
      { key: 'backend_url', value: 'https://legacy.example' },
      { key: 'public_internet_url', value: 'https://legacy.example' },
    ]);
  });
  it('fails before writing settings if a configured secret cannot be encrypted', async () => {
    delete process.env.AUTH_SESSION_SECRET;
    process.env.SMTP_PASS = 'secret';
    await expect(migration.up(runner)).rejects.toThrow('AUTH_SESSION_SECRET is required');
    expect(await runner.query('SELECT * FROM setting')).toEqual([]);
  });
});
