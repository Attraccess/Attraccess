import { ResourceMeter, Setting } from '@attraccess/database-entities';
import { BillingConnection, createBillingDatabase } from './billing-persistence.test-fixture';

type Database = Awaited<ReturnType<typeof createBillingDatabase>>;

describe('billing configuration and credential stores on real SQLite', () => {
  let db: Database;
  let main: BillingConnection;

  beforeAll(async () => {
    db = await createBillingDatabase();
    main = await db.connect();
  }, 120_000);

  afterAll(async () => {
    await db.close();
  });

  describe('currency', () => {
    it('is absent until chosen, then inserted once and updated afterwards', async () => {
      expect(await main.configuration.getCurrency()).toBeNull();

      await main.configuration.saveCurrency('EUR');
      await main.configuration.saveCurrency('EUR');

      expect(await main.configuration.getCurrency()).toBe('EUR');
      expect(await db.primary.getRepository(Setting).countBy({ parent: 'billing', key: 'currency' })).toBe(1);
    });
  });

  describe('resource configuration', () => {
    it('stores a free default on first read and returns the same row afterwards', async () => {
      const { resource } = await db.seed(db.primary, 'cfg');
      expect(await main.configuration.findResourceConfiguration(resource.id)).toBeNull();

      const created = await main.configuration.getOrCreateResourceConfiguration(resource.id);
      const again = await main.configuration.getOrCreateResourceConfiguration(resource.id);

      expect(created).toMatchObject({
        resourceId: resource.id,
        creditsPerUsage: 0,
        creditsPerMinute: 0,
        creditsPerOperatingMinute: 0,
      });
      expect(again.id).toBe(created.id);
    });

    it('creates one default only when independent connections ask at the same time', async () => {
      const { resource } = await db.seed(db.primary, 'cfg-race');
      const other = await db.connectIndependent();

      const results = await Promise.all([
        main.configuration.getOrCreateResourceConfiguration(resource.id),
        other.configuration.getOrCreateResourceConfiguration(resource.id),
        main.configuration.getOrCreateResourceConfiguration(resource.id),
        other.configuration.getOrCreateResourceConfiguration(resource.id),
      ]);

      expect(new Set(results.map((row) => row.id)).size).toBe(1);
    }, 60_000);

    it('saves new rates and keeps the integer values exactly', async () => {
      const { resource } = await db.seed(db.primary, 'cfg-rates');
      await main.configuration.getOrCreateResourceConfiguration(resource.id);

      const saved = await main.configuration.saveResourceRates(resource.id, {
        creditsPerUsage: 150,
        creditsPerMinute: 25,
        creditsPerOperatingMinute: Number.MAX_SAFE_INTEGER,
      });

      expect(saved).toMatchObject({ creditsPerUsage: 150, creditsPerMinute: 25 });
      expect(await main.configuration.findResourceConfiguration(resource.id)).toMatchObject({
        creditsPerOperatingMinute: Number.MAX_SAFE_INTEGER,
      });
    });

    it('sees the configuration a caller transaction has created but not committed', async () => {
      const { resource } = await db.seed(db.primary, 'cfg-tx');

      await expect(
        main.unitOfWork.run(async (scope) => {
          await main.configuration.getOrCreateResourceConfiguration(resource.id, scope);
          expect(await main.configuration.findResourceConfiguration(resource.id, scope)).not.toBeNull();
          expect(await main.configuration.findResourceConfiguration(resource.id)).toBeNull();
          throw new Error('abort');
        }),
      ).rejects.toThrow('abort');

      expect(await main.configuration.findResourceConfiguration(resource.id)).toBeNull();
    });

    it('detects a priced meter only above zero', async () => {
      const { resource } = await db.seed(db.primary, 'cfg-meter');
      expect(await main.configuration.hasPricedMeter(resource.id)).toBe(false);

      const meters = db.primary.getRepository(ResourceMeter);
      const free = await meters.save(meters.create({ resourceId: resource.id, name: 'Free', creditsPerUnit: 0 }));
      expect(await main.configuration.hasPricedMeter(resource.id)).toBe(false);

      await meters.update(free.id, { creditsPerUnit: 3 });
      expect(await main.configuration.hasPricedMeter(resource.id)).toBe(true);
    });
  });

  describe('SumUp credentials', () => {
    it('are absent until saved, then replaced together', async () => {
      expect(await main.credentials.getEncryptedApiKey()).toBeNull();
      expect(await main.credentials.getMerchantCode()).toBeNull();

      await main.credentials.saveCredentials({ encryptedApiKey: 'enc-1', merchantCode: 'M1' });
      await main.credentials.saveCredentials({ encryptedApiKey: 'enc-2', merchantCode: 'M2' });

      expect(await main.credentials.getEncryptedApiKey()).toBe('enc-2');
      expect(await main.credentials.getMerchantCode()).toBe('M2');
      expect(await db.primary.getRepository(Setting).countBy({ parent: 'sumup' })).toBe(2);
    });

    it('keep the previous pair when the save fails halfway', async () => {
      await main.credentials.saveCredentials({ encryptedApiKey: 'enc-ok', merchantCode: 'M-ok' });

      await expect(
        main.credentials.saveCredentials({ encryptedApiKey: 'enc-new', merchantCode: null as never }),
      ).rejects.toThrow();

      expect(await main.credentials.getEncryptedApiKey()).toBe('enc-ok');
      expect(await main.credentials.getMerchantCode()).toBe('M-ok');
    });
  });
});
