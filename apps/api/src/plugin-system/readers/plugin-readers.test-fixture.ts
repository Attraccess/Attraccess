/* eslint-disable @typescript-eslint/no-explicit-any */
import type { UsageSessionUser } from '@attraccess/application-models';
import type { PluginContext, PluginPermission } from '@attraccess/plugins-backend-sdk';
import type { ModuleRef } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  createPluginReadersTestDatabase,
  type PluginReadersTestDatabase,
} from '../../database/adapters/plugins/plugin-readers-database.test-fixture';
import { AuditEvent } from '../../audit/recorder/audit-event';
import { UsageResourceGate } from '../../resources/usage/authorization/usage-resource-gate';
import { ResourceUsageService } from '../../resources/usage/sessions/resource-usage.service';
import { UsageDoorActions } from '../../resources/usage/sessions/usage-door-actions';
import { UsageSessionNotifications } from '../../resources/usage/sessions/usage-session-notifications';
import { LoadedPluginManifest } from '../plugin.manifest';
import { PluginModule } from '../plugin.module';
import { PluginCardAuthentications } from './plugin-card-authentications';
import { PluginReadersService } from './plugin-readers.service';

type PluginModuleInternals = {
  createPluginContext(manifest: LoadedPluginManifest): PluginContext;
};

const databases: PluginReadersTestDatabase[] = [];
afterAll(async () => {
  await Promise.all(databases.splice(0).map((database) => database.dispose()));
});

/**
 * Plugin readers on a real PostgreSQL schema behind plugin contexts built by the real factory. A tap runs the real door
 * action and gate; only the gate's lookups (maintenance, health, control permission) are stubs.
 */
export async function createPluginReadersHost(
  manifest: (overrides?: Partial<LoadedPluginManifest>) => LoadedPluginManifest,
) {
  const database = await createPluginReadersTestDatabase();
  databases.push(database);

  const events = new EventEmitter2();
  const emitAsync = jest.spyOn(events, 'emitAsync');
  const maintenance = {
    hasActiveMaintenance: jest.fn().mockResolvedValue(false),
    canManageMaintenance: jest.fn().mockResolvedValue(false),
  };
  const health = { isResourceUnhealthy: jest.fn().mockResolvedValue(false) };
  const access = { canControllResource: jest.fn().mockResolvedValue(true) };
  const gate = new UsageResourceGate(
    database.usage,
    maintenance as any,
    health as any,
    {} as any,
    {} as any,
    access as any,
  );
  const notifications = new UsageSessionNotifications(
    database.usage,
    events,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  const doors = new UsageDoorActions(database.usage, gate, notifications);
  const usage = {
    openDoor: jest.fn((resourceId: number, user: UsageSessionUser) => doors.openDoor(resourceId, user)),
  };

  const authentications = new PluginCardAuthentications();
  const audited: AuditEvent[] = [];
  const audit = { record: jest.fn(async (event: AuditEvent) => void audited.push(event)) };
  const moduleRef = {
    get: jest.fn((token: unknown) => {
      if (token === ResourceUsageService) return usage;
      if (token === PluginCardAuthentications) return authentications;
      if (token === PluginReadersService) return service;
      throw new Error(`unexpected host token ${String(token)}`);
    }),
  } as unknown as ModuleRef;
  const service = new PluginReadersService(database.store, moduleRef, audit as any, authentications);
  new PluginModule(database.connection, events, moduleRef);

  const contextOf = (id: string, permissions: PluginPermission[]) =>
    (PluginModule as unknown as PluginModuleInternals).createPluginContext(
      manifest({ id, name: `plugin-${id}`, permissions }),
    );

  /** What a successful `cards.authenticate` on the device hands the plugin: by default the user's card. */
  const authenticate = (pluginId: string, device: string, userId: number, cardId = database.cardOf(userId)) =>
    authentications.issue({ pluginId, device, cardId, userId });

  return {
    database,
    service,
    authentications,
    audit,
    audited,
    usage,
    emitAsync,
    maintenance,
    health,
    access,
    contextOf,
    createDoor: database.createDoor,
    createUser: database.createUser,
    cardOf: database.cardOf,
    authenticate,
    doorActions: database.doorActions,
  };
}
