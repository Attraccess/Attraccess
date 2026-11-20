import { TypeOrmSettingsRows } from '../settings/typeorm-settings-rows';
import { Setting } from '@attraccess/database-entities';
import type { PluginAuditDomainDeclaration } from '@attraccess/plugins-backend-sdk';
import { PluginAuditEvent } from '@attraccess/plugins-backend-sdk';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { registerPluginAuditDomains, resetPluginAuditRegistry } from '../../../plugin-system/audit/audit-registry';
import { SettingsStoreService } from '../../../settings/settings-store.service';
import { Registry } from 'prom-client';
import { AuditMetrics, createAuditMetrics } from '../../../metrics/definitions/audit.metrics';
import { AuditService } from '../../../audit/audit.service';
import { createPostgresAuditService } from './postgres-audit-service.test-fixture';
import { AuditQueryService } from '../../../audit/audit-query.service';
import { PluginAuditHost } from '../../../audit/plugin-audit-host';

/** Fresh registry per call so drop counters never leak between tests. */
export const createTestAuditMetrics = (): AuditMetrics => createAuditMetrics(new Registry());

/** Non-zero drop counters as `domain:reason` → count. */
export async function droppedRecords(metrics: AuditMetrics): Promise<Record<string, number>> {
  const { values } = await metrics.recordsDropped.get();
  return Object.fromEntries(
    values.filter(({ value }) => value > 0).map(({ labels, value }) => [`${labels.domain}:${labels.reason}`, value]),
  );
}

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

  let metrics: AuditMetrics;

  beforeEach(async () => {
    resetPluginAuditRegistry();
    registerPluginAuditDomains({ name: 'audit-fixture-plugin', id: fixturePluginId }, [demoDomain]);
    directory = await mkdtemp(join(tmpdir(), 'audit-'));
    // A private database at the current release: audit_log, setting and the RBAC tables included.
    source = await createTestDataSource();
    store = new SettingsStoreService(TypeOrmSettingsRows.forRepository(source.getRepository(Setting)), null);
    metrics = createTestAuditMetrics();
    service = createPostgresAuditService(source, store, metrics);
    await service.onModuleInit();
  });

  afterEach(async () => {
    resetPluginAuditRegistry();
    await service.onModuleDestroy();
    await closeTestDataSource(source);
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
    /** The plugin SDK's host provider, writing through the service's recorder port. */
    get plugins() {
      return new PluginAuditHost(service);
    },
    get query() {
      return new AuditQueryService(service, store);
    },
    get store() {
      return store;
    },
    get metrics() {
      return metrics;
    },
    set service(value: typeof service) {
      service = value;
    },
    set store(value: typeof store) {
      store = value;
    },
  };
}
