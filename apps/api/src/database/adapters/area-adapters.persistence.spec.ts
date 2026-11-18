import { DataSource } from 'typeorm';
import {
  Conversation,
  ConversationParticipant,
  Message,
  Resource,
  CsvExportTemplate,
  EmailTemplate,
  EmailTemplateTranslation,
  NotificationPreference,
  PushSubscription,
  Setting,
  User,
  entities,
} from '@attraccess/database-entities';
import { CsvExportTemplateColumnType, CsvExportType, EmailTemplateType } from '@attraccess/application-models';
import { CsvExportTemplateNameTakenError } from '../../analytics/csv-export-template-store.port';
import { resolveDatabaseBackend } from '../backend';
import { TransactionHandles } from './common/transaction-handles';
import { TypeOrmCsvExportTemplateStore } from './analytics/typeorm-csv-export-template-store';
import { TypeOrmEmailTemplateStore } from './email/typeorm-email-template-store';
import { TypeOrmConversationStore } from './messaging/typeorm-conversation-store';
import { TypeOrmMessageNotificationStore } from './messaging/typeorm-message-notification-store';
import { TypeOrmNotificationPreferenceStore } from './notifications/typeorm-notification-preference-store';
import { TypeOrmPushSubscriptionStore } from './push/typeorm-push-subscription-store';
import { TypeOrmSettingsRows, TypeOrmSetupAccountStats } from './settings/typeorm-settings-rows';
import { legacyEngineTransactionScope } from './common/legacy-engine-transaction';

/** The area adapters against a real SQLite database with the application's schema. */
describe('area persistence adapters (real SQLite)', () => {
  let source: DataSource;

  beforeAll(async () => {
    resolveDatabaseBackend({ DATABASE_TYPE: 'sqlite' });
    source = await new DataSource({
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database: ':memory:',
      entities: Object.values(entities),
      synchronize: true,
    }).initialize();
  }, 60_000);

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  const addUser = (username: string, patch: Partial<User> = {}) =>
    source
      .getRepository(User)
      .save(source.getRepository(User).create({ username, email: `${username}@example.test`, ...patch }));

  describe('settings', () => {
    const rows = () => TypeOrmSettingsRows.forRepository(source.getRepository(Setting));

    it('stores, replaces and removes a value, and reads null for a missing one', async () => {
      expect(await rows().findValue('app', 'url')).toBeNull();

      await rows().upsertValue('app', 'url', 'https://a.example');
      await rows().upsertValue('app', 'url', 'https://b.example');
      expect(await rows().findValue('app', 'url')).toBe('https://b.example');
      expect(await source.getRepository(Setting).countBy({ parent: 'app', key: 'url' })).toBe(1);

      await rows().remove('app', 'url');
      expect(await rows().findValue('app', 'url')).toBeNull();
    });

    it('reads through the transaction it is given and sees its uncommitted write', async () => {
      await source.transaction(async (manager) => {
        await manager.getRepository(Setting).insert({ parent: 'audit', key: 'enabled', value: 'true' });
        expect(await rows().findValue('audit', 'enabled', legacyEngineTransactionScope(manager))).toBe('true');
      });
    });

    it('counts accounts and verified accounts', async () => {
      const stats = new TypeOrmSetupAccountStats(source.getRepository(User));
      const before = await stats.countAccounts();
      const verifiedBefore = await stats.countVerifiedAccounts();
      await addUser('settings-plain');
      await addUser('settings-verified', { isEmailVerified: true });

      expect(await stats.countAccounts()).toBe(before + 2);
      expect(await stats.countVerifiedAccounts()).toBe(verifiedBefore + 1);
    });
  });

  describe('email templates', () => {
    const store = () =>
      new TypeOrmEmailTemplateStore(
        source.getRepository(EmailTemplate),
        source.getRepository(EmailTemplateTranslation),
        new TransactionHandles(undefined as never),
      );
    const type = EmailTemplateType.VERIFY_EMAIL;

    beforeAll(async () => {
      await source
        .getRepository(EmailTemplate)
        .save({ type, subject: 'Subject', body: '<mj-text>Body</mj-text>', variables: ['{{name}}'] });
    });

    it('maps a stored template to a plain record', async () => {
      const found = await store().findTemplate(type);

      expect(found).toEqual({
        type,
        subject: 'Subject',
        body: '<mj-text>Body</mj-text>',
        variables: ['{{name}}'],
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      expect(await store().findTemplate('missing')).toBeNull();
    });

    it('replaces the translations of one locale and keeps the others', async () => {
      await store().replaceTranslations(type, 'de', [{ key: 'greeting', value: 'Hallo' }]);
      await store().replaceTranslations(type, 'en', [{ key: 'greeting', value: 'Hello' }]);
      await store().replaceTranslations(type, 'de', [{ key: 'bye', value: 'Tschüss' }]);

      expect((await store().findTranslations(type, 'de')).map((row) => row.key)).toEqual(['bye']);
      expect(await store().findTranslations(type, 'en')).toHaveLength(1);
    });

    it('rolls the translations back when the work inside the same transaction fails', async () => {
      await store().replaceTranslations(type, 'fr', [{ key: 'greeting', value: 'Bonjour' }]);

      await expect(
        store().replaceTranslations(type, 'fr', [{ key: 'greeting', value: 'Salut' }], async () => {
          throw new Error('audit write failed');
        }),
      ).rejects.toThrow('audit write failed');

      expect(await store().findTranslations(type, 'fr')).toEqual([
        expect.objectContaining({ key: 'greeting', value: 'Bonjour' }),
      ]);
    });

    it('registers a plugin template once, keeps admin edits and only follows the variable list', async () => {
      const key = 'plugin.demo.confirmed';
      const translations = [{ templateType: key as EmailTemplateType, locale: 'de', key: 'k', value: 'v' }];
      await store().registerPluginTemplate({ type: key, subject: 'S', body: 'B', variables: ['a'] }, translations);
      await store().updateContent(key, { subject: 'Edited' });
      await store().registerPluginTemplate(
        { type: key, subject: 'S2', body: 'B2', variables: ['a', 'b'] },
        translations,
      );

      expect(await store().findTemplate(key)).toMatchObject({ subject: 'Edited', body: 'B', variables: ['a', 'b'] });
      expect(await store().findTranslations(key)).toHaveLength(1);
    });

    it('restores the defaults and the shipped translations together', async () => {
      await store().restoreDefaults(type, { subject: 'Default', body: '<mj-text>Default</mj-text>', variables: [] }, [
        { templateType: type, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
      ]);

      expect(await store().findTemplate(type)).toMatchObject({ subject: 'Default', variables: [] });
      expect(await store().findTranslations(type)).toEqual([
        { templateType: type, locale: 'de', key: 'greeting', value: 'Hallo {name},' },
      ]);
    });
  });

  describe('push subscriptions', () => {
    const store = () => new TypeOrmPushSubscriptionStore(source.getRepository(PushSubscription));

    it('replaces the entry of a known endpoint, also for another user, and keeps the user agent', async () => {
      const first = await addUser('push-first');
      const second = await addUser('push-second');
      const base = { endpoint: 'https://push.example/one', p256dh: 'k1', auth: 'a1' };

      const created = await store().upsertByEndpoint({ ...base, userId: first.id, userAgent: 'Browser/1' });
      const moved = await store().upsertByEndpoint({ ...base, p256dh: 'k2', userId: second.id });

      expect(moved).toMatchObject({ id: created.id, userId: second.id, p256dh: 'k2', userAgent: 'Browser/1' });
      expect(moved.lastSeenAt).toBeInstanceOf(Date);
      expect(await store().findForUser(first.id)).toEqual([]);
      expect(await store().findForUser(second.id)).toHaveLength(1);
    });

    it('deletes only the requesting user subscription and clears everything on deleteAll', async () => {
      const owner = await addUser('push-owner');
      const other = await addUser('push-other');
      await store().upsertByEndpoint({
        endpoint: 'https://push.example/own',
        p256dh: 'k',
        auth: 'a',
        userId: owner.id,
      });

      await store().deleteForUser(other.id, 'https://push.example/own');
      expect(await store().findForUser(owner.id)).toHaveLength(1);
      await store().deleteForUser(owner.id, 'https://push.example/own');
      expect(await store().findForUser(owner.id)).toEqual([]);

      await store().upsertByEndpoint({ endpoint: 'https://push.example/x', p256dh: 'k', auth: 'a', userId: owner.id });
      await store().deleteAll();
      expect(await store().count()).toBe(0);
    });
  });

  describe('notification preferences', () => {
    const store = () => new TypeOrmNotificationPreferenceStore(source.getRepository(NotificationPreference));

    it('creates the row with the legacy defaults and replaces the map on the next save', async () => {
      const user = await addUser('prefs');
      expect(await store().findForUser(user.id)).toBeNull();

      const created = await store().saveCategoryChannels(user.id, '{"a":1}');
      expect(created).toEqual({
        userId: user.id,
        messagesEmailOnOffline: true,
        messagesPushEnabled: true,
        categoryChannels: '{"a":1}',
      });
      await store().saveCategoryChannels(user.id, '{"b":2}');

      expect((await store().findForUser(user.id))?.categoryChannels).toBe('{"b":2}');
      expect(await source.getRepository(NotificationPreference).countBy({ userId: user.id })).toBe(1);
    });
  });

  describe('messaging', () => {
    const conversations = () =>
      new TypeOrmConversationStore(
        source.getRepository(Conversation),
        source.getRepository(ConversationParticipant),
        source.getRepository(Message),
        source.getRepository(User),
        source.getRepository(Resource),
        source,
      );

    it('creates a conversation with both participants atomically and finds it again for the pair', async () => {
      const alice = await addUser('msg-alice');
      const bob = await addUser('msg-bob');
      const store = conversations();

      expect(await store.findOneToOneConversation(alice.id, bob.id)).toBeNull();
      const created = await store.createOneToOneConversation(alice.id, bob.id);

      expect(await store.findOneToOneConversation(bob.id, alice.id)).toMatchObject({ id: created.id });
      expect(await store.isParticipant(created.id, alice.id)).toBe(true);
      expect(await store.participantUserIds(created.id)).toEqual(expect.arrayContaining([alice.id, bob.id]));
      expect(await store.userExists(alice.id)).toBe(true);
      expect(await store.userExists(999_999)).toBe(false);
    });

    it('counts unread messages of others, pages newest first with the sender and tracks read state', async () => {
      const alice = await addUser('msg-alice2');
      const bob = await addUser('msg-bob2');
      const store = conversations();
      const { id } = await store.createOneToOneConversation(alice.id, bob.id);
      const message = (senderId: number, content: string) =>
        store.appendMessage({
          conversationId: id,
          senderId,
          content,
          referenceType: null,
          referenceId: null,
          referenceLabel: null,
          referenceUrl: null,
        });

      await message(alice.id, 'one');
      await message(alice.id, 'two');
      await message(bob.id, 'mine');

      expect(await store.countUnread(id, bob.id, null)).toBe(2);
      expect(await store.countUnread(id, alice.id, null)).toBe(1);
      const page = await store.pageMessages(id, 1, 2);
      expect(page.total).toBe(3);
      expect(page.data).toHaveLength(2);
      expect(page.data[0].sender).toMatchObject({ id: expect.any(Number), username: expect.any(String) });
      expect(page.data[0].sender).not.toHaveProperty('email');
      expect(await store.findOtherParticipant(id, alice.id)).toMatchObject({ id: bob.id });

      await store.markRead(id, bob.id, new Date(Date.now() + 60_000));
      const participations = await store.listParticipations(bob.id);
      expect(participations).toEqual([expect.objectContaining({ conversationId: id, lastReadAt: expect.any(Date) })]);
    });

    it('records who was already emailed for an unread burst', async () => {
      const alice = await addUser('msg-alice3');
      const bob = await addUser('msg-bob3');
      const { id } = await conversations().createOneToOneConversation(alice.id, bob.id);
      const notifications = new TypeOrmMessageNotificationStore(
        source.getRepository(ConversationParticipant),
        source.getRepository(User),
      );

      const participants = await notifications.findParticipants(id);
      expect(participants.find((entry) => entry.userId === bob.id)?.recipient).toEqual({
        id: bob.id,
        username: 'msg-bob3',
        email: 'msg-bob3@example.test',
        locale: 'en',
      });
      const notifiedAt = new Date('2026-01-01T10:00:00.000Z');
      const bobEntry = participants.find((entry) => entry.userId === bob.id);
      await notifications.markNotified(bobEntry?.participantId ?? -1, notifiedAt);

      expect(
        (await notifications.findParticipants(id)).find((entry) => entry.userId === bob.id)?.lastNotifiedAt,
      ).toEqual(notifiedAt);
      expect(await notifications.findUsername(alice.id)).toBe('msg-alice3');
    });
  });

  describe('csv export templates', () => {
    const store = () => new TypeOrmCsvExportTemplateStore(source.getRepository(CsvExportTemplate));
    const template = (name: string, exportType = CsvExportType.RESOURCE_USAGE_HOURS) => ({
      name,
      exportType,
      columns: [{ type: CsvExportTemplateColumnType.FIELD, header: 'Machine', fieldKey: 'resourceName' }],
    });

    it('stores columns as JSON and reports a duplicate name per export type in neutral terms', async () => {
      const created = await store().create(template('Accounting'));
      expect(await store().find(created.id)).toMatchObject({ columns: template('x').columns });

      await expect(store().create(template('Accounting'))).rejects.toBeInstanceOf(CsvExportTemplateNameTakenError);
      await expect(store().create(template('Accounting', CsvExportType.BILLING_TRANSACTIONS))).resolves.toBeDefined();
      const other = await store().create(template('Other'));
      await expect(store().update(other.id, { name: 'Accounting' })).rejects.toBeInstanceOf(
        CsvExportTemplateNameTakenError,
      );
    });

    it('updates, lists by export type and removes', async () => {
      const created = await store().create(template('Lister'));
      expect((await store().update(created.id, { name: 'Renamed' }))?.name).toBe('Renamed');
      expect((await store().list(CsvExportType.RESOURCE_HOURS_SUMMARY)).length).toBe(0);
      expect((await store().list(CsvExportType.RESOURCE_USAGE_HOURS)).map((row) => row.name)).toContain('Renamed');

      await store().remove(created.id);
      expect(await store().find(created.id)).toBeNull();
      expect(await store().update(created.id, { name: 'x' })).toBeNull();
    });
  });
});
