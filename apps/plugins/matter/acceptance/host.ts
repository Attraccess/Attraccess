// Boots the Matter plugin inside a Nest app with the real host pieces that matter for it: the plugin migration on a
// real SQLite schema, the host's encryption and audit services, and the SDK's permission guard.
import { AuditLog, entities } from '@attraccess/database-entities';
import { DualAuthGuard, type PluginAuditDomainDeclaration, type PluginContext } from '@attraccess/plugins-backend-sdk';
import { COMPATIBILITY_TABLE } from '@attraccess/matter-contract';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { AuditService } from '../../../api/src/audit/audit.service';
import * as coreMigrations from '../../../api/src/database/migrations';
import { EncryptionService } from '../../../api/src/encryption/encryption.service';
import {
  registerPluginAuditDomains,
  resetPluginAuditRegistry,
} from '../../../api/src/plugin-system/audit/audit-registry';
import { createPluginAuditContext } from '../../../api/src/plugin-system/runtime/audit-context';
import { SettingsStoreService } from '../../../api/src/settings/settings-store.service';
import { Setting } from '@attraccess/database-entities';
import * as matterMigrations from '../backend/migrations';
import { MatterConnectionService } from '../backend/connection/connection.service';
import plugin from '../backend/plugin';

export const PLUGIN_ID = 'MatterAcceptance21chr';
export const HOST_VERSION = '1.11.0';

@Controller('unrelated')
class UnrelatedController {
  @Get()
  ping() {
    return { pid: process.pid, ok: true };
  }
}

@Controller('other-plugin')
class OtherPluginController {
  @Get()
  ping() {
    return { plugin: 'other', ok: true };
  }
}

export type Host = {
  app: INestApplication;
  db: DataSource;
  context: PluginContext;
  service: MatterConnectionService;
  logs: string[];
  close(): Promise<void>;
};

export async function bootHost(options: { hostVersion?: string | undefined } = {}): Promise<Host> {
  resetPluginAuditRegistry(); // the registry is process-wide: a second boot in one test starts clean
  registerPluginAuditDomains(
    { name: '@attraccess/plugin-matter', id: PLUGIN_ID },
    plugin.auditDomains as PluginAuditDomainDeclaration[],
  );
  // The audit service needs a file-backed database: it writes receipts on a separate connection.
  const directory = await mkdtemp(join(tmpdir(), 'matter-acceptance-'));
  const db = await new DataSource({
    type: 'sqlite',
    database: join(directory, 'host.sqlite'),
    entities: [...Object.values(entities), ...(plugin.entities ?? [])],
    migrations: [...Object.values(coreMigrations), ...Object.values(matterMigrations)],
    synchronize: false,
  }).initialize();
  await db.runMigrations();
  const audit = new AuditService(db, new SettingsStoreService(db.getRepository(Setting), null));
  await audit.onModuleInit();
  const encryption = new EncryptionService(
    new ConfigService({ app: { AUTH_SESSION_SECRET: 'matter-acceptance-encryption-key' } }),
  );
  const logs: string[] = [];
  const sink = (level: string) => (message: unknown) => logs.push(`${level}: ${String(message)}`);
  const context = {
    hostVersion: 'hostVersion' in options ? options.hostVersion : HOST_VERSION,
    manifest: { id: PLUGIN_ID, name: 'matter', version: COMPATIBILITY_TABLE[0].plugin, pluginDirectory: 'matter' },
    dataSource: db,
    getRepository: (entity) => db.getRepository(entity),
    audit: createPluginAuditContext(PLUGIN_ID, () => audit),
    events: new EventEmitter2(),
    logger: { log: sink('log'), debug: sink('debug'), warn: sink('warn'), error: sink('error') },
    secrets: {
      encrypt: (value: string) => encryption.encryptForPlugin(PLUGIN_ID, value),
      decrypt: (value: string) => encryption.decryptForPlugin(PLUGIN_ID, value),
    },
  } as unknown as PluginContext;
  const moduleRef = await Test.createTestingModule({
    imports: [plugin.register(context) as never],
    controllers: [UnrelatedController, OtherPluginController],
  })
    .overrideGuard(DualAuthGuard)
    .useValue({
      canActivate: (execution: {
        switchToHttp(): { getRequest(): { headers: Record<string, string>; user?: unknown } };
      }) => {
        const request = execution.switchToHttp().getRequest();
        const permissions = (request.headers['x-test-permissions'] ?? '').split(',').filter(Boolean);
        request.user = { id: 7, authenticationMethod: 'session', effectivePermissions: new Set(permissions) };
        return true;
      },
    })
    .compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  const service = moduleRef.get(MatterConnectionService);
  return {
    app,
    db,
    context,
    service,
    logs,
    close: async () => {
      await app.close();
      await db.destroy();
      await rm(directory, { recursive: true, force: true });
      resetPluginAuditRegistry();
    },
  };
}

export const ADMIN = { 'x-test-permissions': 'system.plugins.manage' };
export const auditRows = (db: DataSource) => db.getRepository(AuditLog).find({ order: { id: 'ASC' } });
