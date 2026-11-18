import { Setting } from '@attraccess/database-entities';
import { BillingConnection, createBillingDatabase } from './billing-persistence.test-fixture';

type Database = Awaited<ReturnType<typeof createBillingDatabase>>;

jest.setTimeout(60_000);

describe('TypeOrmSumUpCredentialStore on real PostgreSQL', () => {
  let db: Database;
  let main: BillingConnection;
  let other: BillingConnection;

  const storedRows = () =>
    db.primary.getRepository(Setting).find({ where: { parent: 'sumup' }, order: { key: 'ASC' } });
  const storedPair = async (connection: BillingConnection) => ({
    encryptedApiKey: await connection.credentials.getEncryptedApiKey(),
    merchantCode: await connection.credentials.getMerchantCode(),
  });

  beforeAll(async () => {
    db = await createBillingDatabase();
    main = await db.connect();
    other = await db.connectIndependent();
  }, 120_000);

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.primary.getRepository(Setting).delete({ parent: 'sumup' });
  });

  it('reports no credentials before any are saved', async () => {
    expect(await storedPair(main)).toEqual({ encryptedApiKey: null, merchantCode: null });
  });

  it('stores both values and reads them back on another connection', async () => {
    await main.credentials.saveCredentials({ encryptedApiKey: 'enc:key-1', merchantCode: 'M1' });

    expect(await storedPair(other)).toEqual({ encryptedApiKey: 'enc:key-1', merchantCode: 'M1' });
  });

  it('replaces the stored values in place instead of adding rows', async () => {
    await main.credentials.saveCredentials({ encryptedApiKey: 'enc:key-1', merchantCode: 'M1' });
    await other.credentials.saveCredentials({ encryptedApiKey: 'enc:key-2', merchantCode: 'M2' });

    expect(await storedPair(main)).toEqual({ encryptedApiKey: 'enc:key-2', merchantCode: 'M2' });
    expect((await storedRows()).map((row) => [row.key, row.value])).toEqual([
      ['apiKey', 'enc:key-2'],
      ['merchantCode', 'M2'],
    ]);
  });

  // Concurrent saves from independent connections are part of the SumUpCredentialStore conformance suite
  // (database/conformance/ports), which runs them on every backend.
});
