import {
  entities,
  User,
  Resource,
  ResourceType,
  PushSubscription,
  EmailTemplate,
  EmailTemplateTranslation,
  EmailTemplateType,
  Conversation,
  ConversationParticipant,
  Message,
  Passkey,
  PasskeyChallenge,
  ApiToken,
  ApiTokenPermission,
  Setting,
  BillingTransaction,
  Project,
  ProjectMember,
  ProjectInvitation,
  ProjectMemberRole,
  Role,
  RolePermission,
  Permission,
  UserRole,
  UserRoleSource,
  PasswordHistory,
  PasswordPolicy,
  PasswordPolicyOverride,
  AuthenticationDetail,
  ResourceUsage,
  ResourceUsageAction,
  Session,
  ResourceGroup,
  MqttServer,
} from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { TypeormAnalyticsPersistence } from '../../analytics/persistence/typeorm-adapter';
import { TypeormVersionPersistence } from '../../version/persistence/typeorm-adapter';
import { TypeormMetricsPersistence } from '../../metrics/persistence/typeorm-adapter';
import { TypeormPushPersistence } from '../../push/persistence/typeorm-adapter';
import { TypeormEmailTemplatePersistence } from '../../email-template/persistence/typeorm-adapter';
import { TypeormMessagingPersistence } from '../../messaging/persistence/typeorm-adapter';
import {
  TypeormPasskeyPersistence,
  TypeormApiTokenPersistence,
} from '../../users-and-auth/auth/persistence/typeorm-adapter';
import { TypeormSumupPersistence } from '../../billing/persistence/typeorm-adapter';
import { TypeormProjectPersistence } from '../../projects/persistence/typeorm-adapter';
import { TypeormRbacPersistence } from '../../users-and-auth/rbac/persistence/typeorm-adapter';
import { TypeormPasswordPolicyPersistence } from '../../users-and-auth/password-policy/persistence/typeorm-adapter';

// Backend assertions formerly mixed into rule suites now run against a real database.
describe('SQLite application operation adapters', () => {
  let source: DataSource;
  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      synchronize: true,
    }).initialize();
    await source
      .getRepository(User)
      .save([1, 2, 3].map((id) => ({ id, username: `user${id}`, email: `user${id}@example.test` })));
    await source.getRepository(Resource).save({ id: 1, name: 'Laser', type: ResourceType.Machine });
  });
  afterEach(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  it('updates subscription keys and owner without losing its identity or optional user agent', async () => {
    const port = new TypeormPushPersistence(source.getRepository(PushSubscription));
    const first = await port.registerSubscription({
      userId: 1,
      endpoint: 'https://push.test/one',
      p256dh: 'old',
      auth: 'old',
      userAgent: 'browser',
      lastSeenAt: new Date(0),
    });
    const second = await port.registerSubscription({
      userId: 2,
      endpoint: first.endpoint,
      p256dh: 'new',
      auth: 'new',
      lastSeenAt: new Date(1000),
    });
    expect(second).toMatchObject({ id: first.id, userId: 2, p256dh: 'new', auth: 'new', userAgent: 'browser' });
    await port.removeOwnedSubscription(1, first.endpoint);
    expect(await port.listUserSubscriptions(2)).toHaveLength(1);
    await port.removeOwnedSubscription(2, first.endpoint);
    expect(await port.countSubscriptions()).toBe(0);
  });

  it('replaces one locale atomically, preserves other locales, and clears all translations when requested', async () => {
    const port = new TypeormEmailTemplatePersistence(
      source.getRepository(EmailTemplate),
      source.getRepository(EmailTemplateTranslation),
    );
    const type = Object.values(EmailTemplateType)[0];
    const row = (locale: string, value: string) => ({ templateType: type, key: 'greeting', locale, value });
    await port.replaceTranslations(type, [row('en', 'Hello'), row('de', 'Hallo')]);
    await source.query(
      "CREATE TRIGGER reject_translation BEFORE INSERT ON email_template_translations WHEN NEW.value = 'invalid' BEGIN SELECT RAISE(ABORT, 'invalid translation'); END",
    );
    await expect(port.replaceTranslations(type, [row('en', 'invalid')], 'en')).rejects.toThrow('invalid translation');
    expect(await port.translations(type, 'en')).toEqual([row('en', 'Hello')]);
    await port.replaceTranslations(type, [row('en', 'Hi')], 'en');
    expect(await port.translations(type, 'de')).toEqual([row('de', 'Hallo')]);
    await port.replaceTranslations(type, []);
    expect(await port.translations(type)).toEqual([]);
  });

  it('creates exactly two conversation participants and rolls back a failed pair', async () => {
    const port = new TypeormMessagingPersistence(
      source.getRepository(Conversation),
      source.getRepository(ConversationParticipant),
      source.getRepository(Message),
      source.getRepository(User),
      source.getRepository(Resource),
      source,
    );
    const conversation = await port.createPair(1, 2);
    expect((await port.participants(conversation.id)).map((row) => row.userId).sort()).toEqual([1, 2]);
    expect(await port.findPair(2, 1)).toMatchObject({ id: conversation.id });
    await expect(port.createPair(1, 999)).rejects.toThrow();
    expect(await source.getRepository(Conversation).count()).toBe(1);
    expect(await source.getRepository(ConversationParticipant).count()).toBe(2);
  });

  it('lets only one concurrent authentication consume a stored challenge', async () => {
    const port = new TypeormPasskeyPersistence(
      source.getRepository(Passkey),
      source.getRepository(PasskeyChallenge),
      source.getRepository(User),
    );
    await port.storeChallenge('challenge', 1, new Date(Date.now() + 60000));
    const results = await Promise.all([port.consumeChallenge('challenge'), port.consumeChallenge('challenge')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.find(Boolean)).toMatchObject({ challenge: 'challenge', userId: 1 });
    expect(await port.consumeChallenge('challenge')).toBeNull();
  });

  it('rolls back token and permission writes together and updates only active tokens', async () => {
    const port = new TypeormApiTokenPersistence(source.getRepository(ApiToken), source.getRepository(User));
    await source.getRepository(Permission).save({ key: 'read', label: 'Read', category: 'test', description: '' });
    const now = new Date();
    const token = await port.createToken(
      { userId: 1, name: 'CLI', tokenHash: 'hash', expiresAt: null, lastUsedAt: null, revokedAt: null },
      ['read'],
    );
    expect(token.permissionKeys).toEqual(['read']);
    const table = source.getMetadata(ApiTokenPermission).tableName;
    await source.query(
      `CREATE TRIGGER reject_permission BEFORE INSERT ON "${table}" WHEN NEW.permissionKey = 'invalid' BEGIN SELECT RAISE(ABORT, 'invalid permission'); END`,
    );
    await expect(
      port.createToken(
        { userId: 1, name: 'Rejected', tokenHash: 'rejected', expiresAt: null, lastUsedAt: null, revokedAt: null },
        ['invalid'],
      ),
    ).rejects.toThrow('invalid permission');
    expect(await source.getRepository(ApiToken).count()).toBe(1);
    await expect(
      port.updateToken({ ...token, name: 'Changed' } as unknown as import('@attraccess/application-models').ApiToken, [
        'invalid',
      ]),
    ).rejects.toThrow('invalid permission');
    expect(await port.findOwned(1, token.id)).toMatchObject({ name: 'CLI', permissionKeys: ['read'] });
    expect(await port.touchActive(token.id, now)).toBe(true);
    await source.getRepository(ApiToken).update(token.id, { expiresAt: now });
    expect(await port.touchActive(token.id, now)).toBe(false);
    await source.getRepository(ApiToken).update(token.id, { expiresAt: null, revokedAt: now });
    expect(await port.touchActive(token.id, now)).toBe(false);
    expect(await port.activePage(1, 1, 10)).toEqual([[], 0]);
  });

  it('inserts and updates both SumUp settings without creating duplicate rows', async () => {
    const port = new TypeormSumupPersistence(source.getRepository(Setting), source.getRepository(BillingTransaction));
    await port.writeCredentials('encrypted-one', 'merchant-one');
    const firstIds = (await source.getRepository(Setting).find()).map((row) => row.id).sort();
    await port.writeCredentials('encrypted-two', 'merchant-two');
    expect(await port.apiKey()).toEqual({ value: 'encrypted-two' });
    expect(await port.merchantCode()).toEqual({ value: 'merchant-two' });
    expect((await source.getRepository(Setting).find()).map((row) => row.id).sort()).toEqual(firstIds);
    expect(firstIds).toHaveLength(2);
  });

  it('lists and counts only owned or joined projects, with archive filtering and pagination', async () => {
    const projects = source.getRepository(Project);
    await projects.save([
      { id: 1, name: 'A owned', owner: { id: 1 } },
      { id: 2, name: 'B member', owner: { id: 2 } },
      { id: 3, name: 'C archived', owner: { id: 1 }, archivedAt: new Date() },
      { id: 4, name: 'D unrelated', owner: { id: 3 } },
    ]);
    await source
      .getRepository(ProjectMember)
      .save({ project: { id: 2 }, user: { id: 1 }, role: ProjectMemberRole.VIEWER });
    const port = new TypeormProjectPersistence(
      projects,
      source.getRepository(ProjectMember),
      source.getRepository(ProjectInvitation),
      source.getRepository(User),
    );
    expect((await port.accessiblePage(1, 2, 1, false)).map((row) => row.id)).toEqual([2]);
    expect(await port.accessibleCount(1, false)).toBe(2);
    expect((await port.accessiblePage(1, 1, 10, true)).map((row) => row.id)).toEqual([1, 2, 3]);
    expect(await port.accessibleCount(1, true)).toBe(3);
  });

  it('excludes deleted users from administrator and permission-holder counts', async () => {
    const role = await source.getRepository(Role).save({ key: 'admin', name: 'Admin', description: '' });
    await source.getRepository(Permission).save({ key: 'read', label: 'Read', category: 'test', description: '' });
    await source.getRepository(RolePermission).save({ roleId: role.id, permissionKey: 'read' });
    await source
      .getRepository(UserRole)
      .save([1, 2].map((userId) => ({ userId, roleId: role.id, source: UserRoleSource.MANUAL })));
    await source.getRepository(User).softDelete(2);
    const port = new TypeormRbacPersistence(
      source.getRepository(UserRole),
      source.getRepository(Role),
      source.getRepository(Permission),
      source.getRepository(User),
      source.getRepository(RolePermission),
    );
    expect(await port.administratorGrantCount(role.id)).toBe(1);
    expect(await port.administratorGrantCount(role.id, 1)).toBe(0);
    expect(await port.userIdsWithPermission('read')).toEqual([1]);
    expect(await port.fullPermissionHolderCount(1)).toBe(1);
    expect(await port.fullPermissionHolderCount(1, role.id)).toBe(0);
    expect(await port.roleUserCounts()).toEqual([{ roleId: role.id, userCount: 1 }]);
  });

  it('prunes password history by newest entries without touching other users', async () => {
    const port = new TypeormPasswordPolicyPersistence(
      source.getRepository(PasswordPolicy),
      source.getRepository(PasswordPolicyOverride),
      source.getRepository(PasswordHistory),
      source.getRepository(AuthenticationDetail),
    );
    for (const id of [1, 2, 3])
      await source
        .getRepository(PasswordHistory)
        .save({ id, userId: 1, passwordHash: `hash${id}`, createdAt: new Date(id * 1000) });
    await port.recordHistory(2, 'other');
    expect((await port.recentHistory(1, 2)).map((row) => row.passwordHash)).toEqual(['hash3', 'hash2']);
    const keep = await port.historyIdsToKeep(1, 2);
    await port.deleteOtherHistory(1, keep);
    expect((await port.recentHistory(1, 10)).map((row) => row.passwordHash)).toEqual(['hash3', 'hash2']);
    await port.deleteOtherHistory(1, []);
    expect(await port.recentHistory(1, 10)).toEqual([]);
    expect((await port.recentHistory(2, 10)).map((row) => row.passwordHash)).toEqual(['other']);
  });
  it('orders and paginates published usage reports with loaded user and resource relations', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-01-02T00:00:00Z');
    await source.getRepository(ResourceUsage).save([
      {
        id: 1,
        resourceId: 1,
        userId: 1,
        startTime: start,
        endTime: end,
        usageAction: ResourceUsageAction.Usage,
        lifecyclePending: false,
      },
      {
        id: 2,
        resourceId: 1,
        userId: 2,
        startTime: start,
        endTime: end,
        usageAction: ResourceUsageAction.Usage,
        lifecyclePending: false,
      },
      {
        id: 3,
        resourceId: 1,
        userId: 3,
        startTime: start,
        usageAction: ResourceUsageAction.Usage,
        lifecyclePending: true,
      },
    ]);
    const port = new TypeormAnalyticsPersistence(
      source.getRepository(ResourceUsage),
      source.getRepository(BillingTransaction),
    );
    const [rows, count] = await port.usageReportPage({ start, end, page: 2, limit: 1 });
    expect(count).toBe(2);
    expect(rows).toMatchObject([{ id: 1, user: { id: 1 }, resource: { id: 1 } }]);
    expect(
      await port.usageReportPage({ start: new Date('2027-01-01'), end: new Date('2027-01-02'), page: 1, limit: 10 }),
    ).toEqual([[], 0]);
  });

  it('counts only published active usage and unexpired login sessions and normalizes locale counts', async () => {
    const at = new Date('2026-01-01T00:00:00Z');
    await source.getRepository(ResourceUsage).save([
      {
        resourceId: 1,
        userId: 1,
        startTime: at,
        usageAction: ResourceUsageAction.Usage,
        endTime: null,
        isFinalized: true,
        lifecyclePending: false,
      },
      {
        resourceId: 1,
        userId: 2,
        startTime: at,
        usageAction: ResourceUsageAction.Usage,
        endTime: null,
        isFinalized: false,
        lifecyclePending: true,
      },
      {
        resourceId: 1,
        userId: 3,
        startTime: at,
        usageAction: ResourceUsageAction.Usage,
        endTime: at,
        isFinalized: true,
        lifecyclePending: false,
      },
    ]);
    await source.getRepository(Session).save([
      { userId: 1, token: 'active', expiresAt: new Date(at.getTime() + 1000) },
      { userId: 2, token: 'expired', expiresAt: at },
    ]);
    await source.getRepository(User).update(1, { locale: 'de' });
    const users = source.getRepository(User),
      resources = source.getRepository(Resource),
      projects = source.getRepository(Project),
      usage = source.getRepository(ResourceUsage),
      sessions = source.getRepository(Session);
    const version = new TypeormVersionPersistence(users, resources, projects, usage, sessions);
    expect(await version.systemCounts(at)).toEqual({
      usersTotal: 3,
      resourcesTotal: 1,
      projectsTotal: 0,
      activeResourceUsageSessions: 1,
      activeAuthSessions: 1,
    });
    const metrics = new TypeormMetricsPersistence(
      users,
      resources,
      projects,
      source.getRepository(ResourceGroup),
      source.getRepository(MqttServer),
      usage,
      sessions,
    );
    expect(await metrics.snapshot(at)).toMatchObject({
      users: 3,
      activeUsageSessions: 1,
      activeAuthSessions: 1,
      localeCounts: expect.arrayContaining([{ locale: 'de', count: 1 }]),
    });
  });
});
