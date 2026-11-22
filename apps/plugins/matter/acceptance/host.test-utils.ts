// Boots the Matter plugin inside a Nest app with the host pieces that matter for it: the record port of the plugin
// storage (the in-memory fake, which applies the same contract as the host's), the host's encryption service, the
// host's plugin audit projection over a recording sink, and the SDK's permission guard. The engine behind the record
// port (PostgreSQL, DDL, migrations, adoption) is the host's and is covered by the host's own conformance tests.
import {
  createInMemoryPluginStorage,
  DualAuthGuard,
  type InMemoryPluginStorage,
  type PluginAuditDomainDeclaration,
  type PluginContext,
} from '@attraccess/plugins-backend-sdk';
import { COMPATIBILITY_TABLE } from '@attraccess/matter-contract';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { join } from 'node:path';
import { PluginAuditHost } from '../../../api/src/audit/plugin-audit-host';
import type { AuditEvent, AuditRecorder } from '../../../api/src/audit/recorder/audit-event';
import { EncryptionService } from '../../../api/src/encryption/encryption.service';
import {
  registerPluginAuditDomains,
  resetPluginAuditRegistry,
} from '../../../api/src/plugin-system/audit/audit-registry';
import { createPluginAuditContext } from '../../../api/src/plugin-system/runtime/audit-context';
import { MatterConnectionService } from '../backend/connection/connection.service';
import sourcePlugin from '../backend/plugin';
import { matterStorage } from '../backend/plugin-storage/access';

export const PLUGIN_ID = 'MatterAcceptance21chr';
export const HOST_VERSION = '2.0.0';

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
  /** The fake record port behind `context.storage`. */
  storage: InMemoryPluginStorage;
  /** The events the host's audit projection accepted, in order. */
  audit: AuditEvent[];
  context: PluginContext;
  service: MatterConnectionService;
  logs: string[];
  close(): Promise<void>;
};

/**
 * `source` runs the plugin through ts-jest, which emits decorator metadata. `bundle` loads the packed esbuild output
 * the real host loads: it has no `design:paramtypes`, so every constructor parameter needs an explicit `@Inject`.
 */
export type PluginSource = 'source' | 'bundle';

function loadPlugin(source: PluginSource) {
  if (source === 'source') return sourcePlugin;
  return require(join(__dirname, '../package/dist/index.js')).default as typeof sourcePlugin;
}

export async function bootHost(
  options: { hostVersion?: string | undefined; source?: PluginSource; storage?: InMemoryPluginStorage } = {},
): Promise<Host> {
  const plugin = loadPlugin(options.source ?? 'source');
  resetPluginAuditRegistry(); // the registry is process-wide: a second boot in one test starts clean
  registerPluginAuditDomains(
    { name: '@attraccess/plugin-matter', id: PLUGIN_ID },
    plugin.auditDomains as PluginAuditDomainDeclaration[],
  );
  // A restart of the plugin keeps its database: pass the previous host's storage.
  const storage = options.storage ?? createInMemoryPluginStorage(plugin.storage as NonNullable<typeof plugin.storage>);
  // The host's audit recorder drops an event its plugin projection rejects (outside the declared domain policy); this
  // stand-in records the ones that pass, and answers like the recorder does.
  const audit: AuditEvent[] = [];
  const recorder: AuditRecorder = {
    async record(event) {
      if (!event.domain) return { status: 'unavailable' };
      audit.push(event);
      return { status: 'recorded' };
    },
  };
  const encryption = new EncryptionService(
    new ConfigService({ app: { AUTH_SESSION_SECRET: 'matter-acceptance-encryption-key' } }),
  );
  const logs: string[] = [];
  const sink = (level: string) => (message: unknown) => logs.push(`${level}: ${String(message)}`);
  const context = {
    hostVersion: 'hostVersion' in options ? options.hostVersion : HOST_VERSION,
    manifest: { id: PLUGIN_ID, name: 'matter', version: COMPATIBILITY_TABLE[0].plugin, pluginDirectory: 'matter' },
    storage: storage.storage,
    persistence: storage.persistence,
    audit: createPluginAuditContext(PLUGIN_ID, () => new PluginAuditHost(recorder)),
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
  const provided = (plugin.register(context) as { providers?: unknown[] }).providers ?? [];
  const serviceClass = (provided.find((p) => typeof p === 'function' && p.name === 'MatterConnectionService') ??
    MatterConnectionService) as typeof MatterConnectionService;
  const service = moduleRef.get(serviceClass);
  return {
    app,
    storage,
    audit,
    context,
    service,
    logs,
    close: async () => {
      await app.close();
      resetPluginAuditRegistry();
    },
  };
}

export const ADMIN = { 'x-test-permissions': 'matter.devices.read,matter.devices.manage' };
/** The audit events recorded so far. */
export const auditRows = (host: Host): AuditEvent[] => [...host.audit];
/** The rows of the connection settings table. */
export const connectionRows = (host: Host) => matterStorage(host.context).tables.connection.find();
