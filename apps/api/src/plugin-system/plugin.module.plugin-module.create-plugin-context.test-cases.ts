import 'reflect-metadata';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { ModuleRef } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { User } from '@attraccess/database-entities';
import { PLUGIN_AUDIT_HOST_PROVIDER, PluginPermission, PluginPermissionError } from '@attraccess/plugins-backend-sdk';
import { PluginModule } from './plugin.module';
import { LoadedPluginManifest } from './plugin.manifest';
import { ResourceFlowsExecutorService } from '../resources/flows/resource-flows-executor.service';
import { registerPluginModuleFixture } from './plugin.module.plugin-module.test-fixture';
export function registerCreatePluginContextCases(fixture: ReturnType<typeof registerPluginModuleFixture>) {
  describe('createPluginContext', () => {
    const events = new EventEmitter2();
    const dataSource = { kind: 'host-datasource' } as unknown as DataSource;
    const moduleRef = { get: jest.fn((token: unknown) => ({ token })) } as unknown as ModuleRef;

    function build(permissions: PluginPermission[]) {
      new PluginModule(dataSource, events, moduleRef);
      return (
        PluginModule as unknown as {
          createPluginContext(m: LoadedPluginManifest): import('@attraccess/plugins-backend-sdk').PluginContext;
        }
      ).createPluginContext(fixture.manifest({ permissions }));
    }

    it('projects the manifest down to public info', () => {
      const ctx = build([]);
      expect(ctx.manifest).toEqual({
        id: 'plugin-id',
        name: 'ctx-plugin',
        version: '1.0.0',
        pluginDirectory: 'ctx-plugin',
      });
    });

    it('exposes the audit sink through the guarded context with host-bound plugin identity', async () => {
      const record = jest.fn(async () => ({ status: 'recorded' as const }));
      (moduleRef.get as jest.Mock).mockImplementation((token: unknown) =>
        token === PLUGIN_AUDIT_HOST_PROVIDER ? { record } : undefined,
      );
      await expect(
        build([]).audit.record({
          action: 'demo.claim',
          operationId: 'operation-id',
          outcome: 'succeeded',
          principal: { userId: 7, authenticationMethod: 'session' },
          subject: { type: 'demo.device', id: 2 },
          details: {},
        }),
      ).resolves.toEqual({ status: 'recorded' });
      expect(record).toHaveBeenCalledWith(expect.objectContaining({ pluginId: 'plugin-id' }));
      expect(moduleRef.get).toHaveBeenCalledWith(PLUGIN_AUDIT_HOST_PROVIDER, { strict: false });
    });

    it('hands back the live host DataSource when DATABASE_ACCESS is granted', () => {
      expect(build([PluginPermission.DATABASE_ACCESS]).dataSource).toBe(dataSource);
      expect(() => build([]).dataSource).toThrow(PluginPermissionError);
    });

    it('lets a plugin constructor retain a repository before the host DataSource is injected', async () => {
      class Widget {}
      const find = jest.fn(async () => [new Widget()]);
      const repository = { find };
      const host = { getRepository: jest.fn(() => repository) } as unknown as DataSource;
      const internals = PluginModule as unknown as {
        dataSourceRef: DataSource | null;
        createPluginContext(m: LoadedPluginManifest): import('@attraccess/plugins-backend-sdk').PluginContext;
      };
      internals.dataSourceRef = null;

      const context = internals.createPluginContext(
        fixture.manifest({ permissions: [PluginPermission.DATABASE_ACCESS] }),
      );
      const retained = context.getRepository(Widget);
      expect(host.getRepository).not.toHaveBeenCalled();
      expect(() => retained.find()).toThrow(/accessed before bootstrap completed/);

      new PluginModule(host, events, moduleRef);
      await expect(retained.find()).resolves.toEqual([expect.any(Widget)]);
      expect(host.getRepository).toHaveBeenCalledWith(Widget);
      expect(find).toHaveBeenCalledTimes(1);
    });

    it('rechecks entity metadata permissions before resolving a retained repository', async () => {
      const find = jest.fn(async () => [new User()]);
      const host = {
        getMetadata: jest.fn(() => ({ target: User })),
        getRepository: jest.fn(() => ({ find })),
      } as unknown as DataSource;
      const internals = PluginModule as unknown as {
        resetHostReferences(): void;
        createPluginContext(m: LoadedPluginManifest): import('@attraccess/plugins-backend-sdk').PluginContext;
      };
      internals.resetHostReferences();

      const denied = internals.createPluginContext(
        fixture.manifest({ permissions: [PluginPermission.DATABASE_ACCESS] }),
      );
      const retained = denied.getRepository('user');
      new PluginModule(host, events, moduleRef);

      expect(() => retained.find()).toThrow(/READ_USERS/);
      expect(host.getRepository).not.toHaveBeenCalled();
      expect(find).not.toHaveBeenCalled();

      internals.resetHostReferences();
      const allowed = internals.createPluginContext(
        fixture.manifest({ permissions: [PluginPermission.DATABASE_ACCESS, PluginPermission.READ_USERS] }),
      );
      const permitted = allowed.getRepository('user');
      new PluginModule(host, events, moduleRef);
      await expect(permitted.find()).resolves.toEqual([expect.any(User)]);
      expect(host.getRepository).toHaveBeenCalledWith('user');
    });

    it('does not hand the second application a repository from the closed configuration application', async () => {
      class Widget {}
      const first = { getRepository: jest.fn(() => ({ find: async () => ['closed'] })) } as unknown as DataSource;
      const find = jest.fn(async () => ['live']);
      const second = { getRepository: jest.fn(() => ({ find })) } as unknown as DataSource;
      const internals = PluginModule as unknown as {
        resetHostReferences(): void;
        createPluginContext(m: LoadedPluginManifest): import('@attraccess/plugins-backend-sdk').PluginContext;
      };
      new PluginModule(first, events, moduleRef);
      internals.resetHostReferences();

      const context = internals.createPluginContext(
        fixture.manifest({ permissions: [PluginPermission.DATABASE_ACCESS] }),
      );
      const retained = context.getRepository(Widget);
      new PluginModule(second, events, moduleRef);

      await expect(retained.find()).resolves.toEqual(['live']);
      expect(first.getRepository).not.toHaveBeenCalled();
      expect(second.getRepository).toHaveBeenCalledWith(Widget);
    });

    it('resolves host providers through the ModuleRef when permitted', () => {
      const ctx = build([PluginPermission.RESOLVE_HOST_PROVIDERS]);
      ctx.get('SOME_TOKEN');
      expect(moduleRef.get).toHaveBeenCalledWith('SOME_TOKEN', { strict: false });
      expect(() => build([]).get('SOME_TOKEN')).toThrow(/RESOLVE_HOST_PROVIDERS/);
    });

    it('gates the shared event bus behind EMIT/LISTEN permissions', () => {
      expect(() => build([PluginPermission.EMIT_EVENTS]).events.emit('x')).not.toThrow();
      expect(() => build([]).events.emit('x')).toThrow(/EMIT_EVENTS/);
    });

    it('delegates permitted flow triggers to the host executor', async () => {
      const triggerPluginFlows = jest.fn(async () => undefined);
      (moduleRef.get as jest.Mock).mockImplementation((token: unknown) =>
        token === ResourceFlowsExecutorService ? { triggerPluginFlows } : { token },
      );

      await build([PluginPermission.TRIGGER_FLOWS]).flows.trigger('plugin.test.trigger', () => true, { event: 'x' });
      expect(triggerPluginFlows).toHaveBeenCalledWith('ctx-plugin', 'plugin.test.trigger', expect.any(Function), {
        event: 'x',
      });
    });
  });
}
