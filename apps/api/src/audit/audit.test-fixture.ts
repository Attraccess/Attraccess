import { AuditLog, Setting } from '@attraccess/database-entities';
import type { PluginAuditDomainDeclaration } from '@attraccess/plugins-backend-sdk';
import { PluginAuditEvent } from '@attraccess/plugins-backend-sdk';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { DurableAudit1783700000000 } from '../database/migrations/1783700000000-durable-audit';
import { IdentityAudit1783800000000 } from '../database/migrations/1783800000000-identity-audit';
import { registerPluginAuditDomains, resetPluginAuditRegistry } from '../plugin-system/plugin-audit-registry';
import { SettingsStoreService } from '../settings/settings-store.service';
import { AuditService } from './audit.service';

export const fixturePluginId = 'abcdefghijklmnopqrstu';

/** Neutral stand-in for a plugin-contributed audit domain; the host never names a real plugin. */
export const demoDomain: PluginAuditDomainDeclaration = {
  domain: 'demo',
  labels: { en: 'Demo devices' },
  actions: [
    { action: 'demo.claim', subjectTypes: ['demo.device'] },
    {
      action: 'demo.publication',
      subjectTypes: ['demo.device'],
      details: { revision: { type: 'number', integer: true, min: 1 } },
    },
    {
      action: 'demo.rollback',
      subjectTypes: ['demo.device'],
      details: {
        sourceRevision: { type: 'number', integer: true, min: 1 },
        revision: { type: 'number', integer: true, min: 1 },
      },
    },
    {
      action: 'demo.manual_command',
      subjectTypes: ['demo.device'],
      details: {
        channelId: { type: 'string', pattern: '[a-zA-Z0-9_-]{1,64}' },
        commandId: {
          type: 'string',
          pattern: '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
        },
        operation: { type: 'string', oneOf: ['set', 'pulse'] },
        result: { type: 'string', oneOf: ['dispatched', 'acknowledged', 'rejected', 'timeout', 'transport_failure'] },
      },
    },
    {
      action: 'demo.profile_change',
      subjectTypes: ['demo.device'],
      details: {
        profileId: { type: 'string', maxLength: 160, pattern: '(?=[\\s\\S]*\\S)[\\s\\S]*' },
        profileVersion: { type: 'number', integer: true, min: 1, max: 1_000_000 },
        'before.physicalPointCount': { type: 'number', integer: true, min: 0 },
        'before.logicalChannelCount': { type: 'number', integer: true, min: 0 },
        'after.physicalPointCount': { type: 'number', integer: true, min: 0 },
        'after.logicalChannelCount': { type: 'number', integer: true, min: 0 },
      },
    },
    { action: 'demo.commissioning.install', subjectTypes: ['demo.commissioning'] },
    { action: 'demo.commissioning.recover', subjectTypes: ['demo.commissioning'] },
  ],
};

export const event = (): PluginAuditEvent & { pluginId: string } => ({
  pluginId: fixturePluginId,
  action: 'demo.publication',
  operationId: randomUUID(),
  principal: { userId: 42, authenticationMethod: 'session' },
  outcome: 'succeeded',
  subject: { type: 'demo.device', id: 7 },
  details: { revision: 2 },
});

export const config = {
  enabled: true,
  domains: ['administration', 'attractap', 'identity', 'project', 'resource', 'sso'],
  plugin_domains_disabled: [],
  retention_days: 90,
};
export function setupAuditDatabase() {
  let directory: string;

  let source: DataSource;

  let service: AuditService;

  let store: SettingsStoreService;

  const migration = new DurableAudit1783700000000();

  const identityMigration = new IdentityAudit1783800000000();

  beforeEach(async () => {
    resetPluginAuditRegistry();
    registerPluginAuditDomains({ name: 'audit-fixture-plugin', id: fixturePluginId }, [demoDomain]);
    directory = await mkdtemp(join(tmpdir(), 'audit-'));
    source = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'fixture.sqlite'),
      entities: [AuditLog, Setting],
    }).initialize();
    // Existing RBAC schema, with data that an additive upgrade must preserve.
    await source.query('CREATE TABLE permission (key text PRIMARY KEY, label text, description text, category text)');
    await source.query('CREATE TABLE role (id integer PRIMARY KEY, key text)');
    await source.query('CREATE TABLE role_permission (roleId integer, permissionKey text)');
    await source.query('CREATE TABLE api_token_permission (apiTokenId integer, permissionKey text)');
    await source.query("INSERT INTO role VALUES (1, 'administrator'), (2, 'member')");
    await migration.up(source.createQueryRunner());
    await identityMigration.up(source.createQueryRunner());
    await source.query(
      'CREATE TABLE IF NOT EXISTS setting (id integer PRIMARY KEY AUTOINCREMENT, parent varchar NOT NULL, key varchar NOT NULL, value varchar NOT NULL, createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    store = new SettingsStoreService(source.getRepository(Setting), null);
    service = new AuditService(source, store);
    await service.onModuleInit();
  });

  afterEach(async () => {
    resetPluginAuditRegistry();
    await service.onModuleDestroy();
    if (source.isInitialized) await source.destroy();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    get fixturePluginId() {
      return fixturePluginId;
    },
    get demoDomain() {
      return demoDomain;
    },
    get event() {
      return event;
    },
    get config() {
      return config;
    },
    get directory() {
      return directory;
    },
    get source() {
      return source;
    },
    get service() {
      return service;
    },
    get store() {
      return store;
    },
    get migration() {
      return migration;
    },
    get identityMigration() {
      return identityMigration;
    },
    set service(value: typeof service) {
      service = value;
    },
    set store(value: typeof store) {
      store = value;
    },
  };
}
