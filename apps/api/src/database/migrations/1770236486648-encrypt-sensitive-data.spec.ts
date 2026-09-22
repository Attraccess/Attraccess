import { DataSource, QueryRunner } from 'typeorm';
import { EncryptSensitiveData1770236486648 } from './1770236486648-encrypt-sensitive-data';

const columns = [
  ['nfc_card', 'key'],
  ['mqtt_server', 'password'],
  ['sso_provider_oidc_configuration', 'clientSecret'],
  ['sso_provider_saml_configuration', 'provisioningSecret'],
  ['authentication_detail', 'totpSecret'],
  ['user', 'nfcKeySeedToken'],
];
describe('sensitive data encryption migration', () => {
  let source: DataSource;
  let runner: QueryRunner;
  const originalSecret = process.env.AUTH_SESSION_SECRET;
  const migration = new EncryptSensitiveData1770236486648();
  beforeEach(async () => {
    process.env.AUTH_SESSION_SECRET = 'migration-secret';
    source = await new DataSource({ type: 'sqlite', database: ':memory:', entities: [] }).initialize();
    runner = source.createQueryRunner();
    for (const [table, column] of columns) {
      await runner.query(`CREATE TABLE "${table}" (id INTEGER PRIMARY KEY, "${column}" TEXT)`);
      await runner.query(`INSERT INTO "${table}" VALUES (1, 'plaintext'), (2, ''), (3, NULL)`);
    }
  });
  afterEach(async () => {
    if (originalSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = originalSecret;
    jest.restoreAllMocks();
    await runner.release();
    await source.destroy();
  });
  it('encrypts all sensitive columns idempotently and restores their plaintext on rollback', async () => {
    await migration.up(runner);
    const [encrypted] = await runner.query('SELECT key FROM nfc_card WHERE id = 1');
    expect(encrypted.key).toMatch(/^v1\./);
    await migration.up(runner);
    expect(await runner.query('SELECT key FROM nfc_card WHERE id = 1')).toEqual([encrypted]);
    await migration.down(runner);
    for (const [table, column] of columns) {
      expect(await runner.query(`SELECT "${column}" AS value FROM "${table}" ORDER BY id`)).toEqual([
        { value: 'plaintext' },
        { value: '' },
        { value: null },
      ]);
    }
  });
  it('preserves ciphertext encrypted with another key and reports skipped rows', async () => {
    await migration.up(runner);
    const before = await runner.query('SELECT * FROM nfc_card');
    process.env.AUTH_SESSION_SECRET = 'different-secret';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await migration.down(runner);
    expect(await runner.query('SELECT * FROM nfc_card')).toEqual(before);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('skipped'),
      6,
      expect.stringContaining('nfc_card.key(id=1)'),
    );
  });
  it.each(['v1.', 'v1.AA==', 'v1.AA'])('rejects malformed ciphertext without overwriting it: %s', async (token) => {
    await runner.query('UPDATE nfc_card SET key = ? WHERE id = 1', [token]);
    await expect(migration.down(runner)).rejects.toThrow('decrypt:');
    expect(await runner.query('SELECT key FROM nfc_card WHERE id = 1')).toEqual([{ key: token }]);
  });
  it('skips encryption without a session secret but refuses an unsafe rollback', async () => {
    delete process.env.AUTH_SESSION_SECRET;
    await migration.up(runner);
    expect(await runner.query('SELECT key FROM nfc_card WHERE id = 1')).toEqual([{ key: 'plaintext' }]);
    await expect(migration.down(runner)).rejects.toThrow('AUTH_SESSION_SECRET is required');
  });
});
