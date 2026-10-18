import { createMock } from '@golevelup/ts-jest';
import { entities, Setting, User } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as migrations from '../../database/migrations';
import { EncryptionService } from '../../encryption/encryption.service';
import { LicenseService } from '../../license/license.service';
import { MetricsService } from '../../metrics/metrics.service';
import { APP_KEYS, APP_PARENT } from '../../settings/constants';
import { SettingsStoreService } from '../../settings/settings-store.service';
import { SettingsService } from '../../settings/settings.service';
import { RbacService } from '../rbac/rbac.service';
import { UsersService } from './users.service';

describe('new account language persistence', () => {
  let source: DataSource;
  let users: UsersService;
  let settings: SettingsService;
  let store: SettingsStoreService;

  beforeAll(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      migrations: Object.values(migrations),
    }).initialize();
    await source.runMigrations();
    store = new SettingsStoreService(source.getRepository(Setting), createMock<EncryptionService>());
    settings = Object.assign(Object.create(SettingsService.prototype), { settingsStore: store });
    // Execute production creation, transactions, persistence and language resolution.
    // Licensing, roles and metrics are unrelated collaborators for this regression.
    users = Object.assign(Object.create(UsersService.prototype), {
      logger: createMock<Logger>(),
      userRepository: source.getRepository(User),
      dataSource: source,
      licenseService: createMock<LicenseService>(),
      rbacService: createMock<RbacService>(),
      metricsService: createMock<MetricsService>(),
    });
  }, 60_000);

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  it.each(['single', 'bulk'] as const)(
    '%s creation leaves unknown preferences following later defaults',
    async (path) => {
      for (const [index, locale] of [undefined, '', 'fr-FR', 'en-!!!', 'de-u-12'].entries()) {
        const input = { username: `${path}${index}`, email: `${path}${index}@example.test`, locale };
        const user =
          path === 'single'
            ? await users.createOne({ ...input, externalIdentifier: null })
            : (await users.createMany([input]))[0];
        const persisted = await source.getRepository(User).findOneByOrFail({ id: user.id });
        expect(persisted.locale).toBe('und');
        await store.setPlainSetting(APP_PARENT, APP_KEYS.defaultLanguage, 'de');
        expect(await settings.resolveLanguage(persisted.locale)).toBe('de');
        await store.setPlainSetting(APP_PARENT, APP_KEYS.defaultLanguage, 'en');
        expect(await settings.resolveLanguage(persisted.locale)).toBe('en');
        expect((await source.getRepository(User).findOneByOrFail({ id: user.id })).locale).toBe('und');
      }
    },
  );

  it.each(['single', 'bulk'] as const)('%s creation preserves supported regional preferences', async (path) => {
    for (const [index, locale] of ['de-AT', 'EN-Latn-GB'].entries()) {
      const input = { username: `${path}supported${index}`, email: `${path}supported${index}@example.test`, locale };
      const user =
        path === 'single'
          ? await users.createOne({ ...input, externalIdentifier: null })
          : (await users.createMany([input]))[0];
      const persisted = await source.getRepository(User).findOneByOrFail({ id: user.id });
      expect(persisted.locale).toBe(locale);
      await store.setPlainSetting(APP_PARENT, APP_KEYS.defaultLanguage, locale === 'de-AT' ? 'en' : 'de');
      expect(await settings.resolveLanguage(persisted.locale)).toBe(locale === 'de-AT' ? 'de' : 'en');
    }
  });
});
