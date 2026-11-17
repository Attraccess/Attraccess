import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PluginBleError, PluginPermission, type PluginBleContext } from '@attraccess/plugins-backend-sdk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ModuleRef } from '@nestjs/core';
import type { DataSource } from 'typeorm';
import { registerPluginModuleFixture } from '../plugin.module.plugin-module.test-fixture';
import { PluginModule } from '../plugin.module';
import { PluginService } from '../plugin.service';
import { PluginBleService } from './plugin-ble.service';
import { PluginMqttService } from '../plugin-mqtt.service';
import { PluginLiveUpdatesService } from '../plugin-live-updates.service';
import { clearPluginBleProfiles } from './plugin-ble-profile-registry';
import { createHostBleHarness, type HostBleHarness } from './__test__/ble-host-harness.test-fixture';

const PROFILE = `{
  id: 'shared-profile',
  advertisement: { serviceUuids: ['fff0'] },
  services: [{ uuid: 'fff0', characteristics: [{ key: 'info', uuid: 'fff1', operations: ['read'], maxReadBytes: 8 }] }],
}`;

const required = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('fixture is missing');
  return value;
};

/** A plugin that registers its profile in `register()` and from a provider factory, and exposes its context. */
const pluginSource = (name: string) => `
  const profile = ${PROFILE};
  module.exports = { default: { register: (context) => {
    const registered = context.ble.registerProfile(profile);
    return { module: class FixtureModule {}, providers: [
      { provide: 'FIXTURE_CONTEXT', useValue: { name: '${name}', ble: context.ble, registered } },
      { provide: 'FIXTURE_CONSTRUCT', useFactory: () => context.ble.registerProfile(profile) },
    ] };
  } } };
`;

interface Fixture {
  name: string;
  ble: PluginBleContext;
  registered: unknown;
  construct(): unknown;
}

type ProviderList = Array<{ provide?: string; useValue?: Fixture; useFactory?: () => unknown }>;

/** The plugin contexts and provider factories exposed by the loaded plugin modules. */
const loaded = (module: { imports?: unknown[] }): Fixture[] =>
  (module.imports as Array<{ providers?: ProviderList }>)
    .filter((entry) => entry.providers)
    .map((entry) => {
      const providers = entry.providers as ProviderList;
      const context = required(providers.find((provider) => provider.provide === 'FIXTURE_CONTEXT')?.useValue);
      const construct = required(providers.find((provider) => provider.provide === 'FIXTURE_CONSTRUCT')?.useFactory);
      return { ...context, construct };
    });

describe('plugin BLE through the plugin module', () => {
  const fixture = registerPluginModuleFixture();
  let harness: HostBleHarness;
  const moduleRefGet = jest.fn();

  const writePlugin = (name: string, directory = name) => {
    mkdirSync(join(fixture.root, directory, 'dist'), { recursive: true });
    writeFileSync(
      join(fixture.root, directory, 'plugin.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        permissions: [PluginPermission.BLE_TRANSPORT],
        attraccessVersion: { min: '2.0.0-0' },
      }),
    );
    writeFileSync(join(fixture.root, directory, 'dist', 'index.js'), pluginSource(name));
  };

  const bootstrap = () => {
    const moduleRef = {
      get: (token: unknown) => {
        moduleRefGet(token);
        if (token === PluginBleService) return harness.service;
        if (token === PluginMqttService || token === PluginLiveUpdatesService) return { clearPlugin: jest.fn() };
        throw new Error('unexpected token');
      },
    } as unknown as ModuleRef;
    new PluginModule({} as DataSource, new EventEmitter2(), moduleRef);
  };

  beforeEach(async () => {
    moduleRefGet.mockClear();
    harness = await createHostBleHarness();
    PluginModule.resetHostReferences();
    await harness.addReader({ readerId: 1, name: 'Reader', allowPluginBle: true });
    harness.addPeripheral({
      readerId: 1,
      address: 'AA:BB:CC:DD:EE:01',
      addressType: 'public',
      advertisement: { serviceUuids: ['fff0'] },
      characteristics: { fff1: { value: Uint8Array.of(1) } },
    });
    clearPluginBleProfiles();
  });

  afterEach(async () => {
    PluginModule.resetHostReferences();
    await harness.dispose();
  });

  const ADDRESS = 'aa:bb:cc:dd:ee:01';
  const input = { readerId: 1, address: ADDRESS, addressType: 'public' as const, profileId: 'shared-profile' };

  it.each([
    ['alpha', 'beta'],
    ['beta', 'alpha'],
  ])(
    'registers profiles before bootstrap and keeps ownership (%s loads and binds first, %s second)',
    async (first, second) => {
      // Plugins load in directory order, so the directory names decide which manifest registers first.
      writePlugin(second, '2-plugin');
      writePlugin(first, '1-plugin');

      const plugins = loaded(PluginModule.forRoot());
      // The plugin modules come back in the order their register() ran.
      expect(plugins.map((plugin) => plugin.name)).toEqual([first, second]);
      const one = required(plugins.find((plugin) => plugin.name === first));
      const two = required(plugins.find((plugin) => plugin.name === second));

      // Loading registered both profiles without touching a single host singleton.
      expect(moduleRefGet).not.toHaveBeenCalled();
      expect(one.registered).toMatchObject({ id: 'shared-profile' });
      // A provider constructor may register again before any host reference exists; it is idempotent.
      expect(one.construct()).toBe(one.registered);

      for (const plugin of [one, two]) {
        let call: Promise<unknown> | undefined;
        expect(() => (call = plugin.ble.openSession('anything'))).not.toThrow();
        await expect(call).rejects.toMatchObject({ code: 'NOT_READY', retryable: true });
        await expect(plugin.ble.listReaders()).rejects.toBeInstanceOf(PluginBleError);
      }

      bootstrap();

      const created = await one.ble.createEndpoint(input);
      await expect(two.ble.getEndpoint(created.id)).rejects.toMatchObject({ code: 'ENDPOINT_NOT_FOUND' });
      await expect(two.ble.openSession(created.id)).rejects.toMatchObject({ code: 'ENDPOINT_NOT_FOUND' });
      await expect(two.ble.createEndpoint(input)).rejects.toMatchObject({ code: 'ENDPOINT_CONFLICT' });
      await expect(two.ble.listEndpoints()).resolves.toEqual([]);
      await expect(one.ble.listEndpoints()).resolves.toHaveLength(1);

      harness.setTransportAvailable(false);
      await expect(one.ble.openSession(created.id)).rejects.toMatchObject({ code: 'TRANSPORT_UNAVAILABLE' });
      harness.setTransportAvailable(true);
      await expect(one.ble.withSession(created.id, (session) => session.read('info'))).resolves.toEqual(
        Uint8Array.of(1),
      );
    },
  );

  it('registers the same profiles again in the real app after the temporary configuration app', () => {
    writePlugin('alpha');
    const loaded = () => PluginService.getPluginsWithLoadStatus().find((plugin) => plugin.name === 'alpha');

    expect(PluginModule.forRoot().imports).toHaveLength(5);
    PluginModule.resetHostReferences();
    expect(PluginModule.forRoot().imports).toHaveLength(5);
    expect(loaded()?.status).not.toBe('error');
  });

  it('quarantines a plugin that registers a different profile under an existing id', () => {
    mkdirSync(join(fixture.root, 'clash', 'dist'), { recursive: true });
    writeFileSync(
      join(fixture.root, 'clash', 'plugin.json'),
      JSON.stringify({
        name: 'clash',
        version: '1.0.0',
        main: { backend: { directory: 'dist', entryPoint: 'index.js' } },
        permissions: [PluginPermission.BLE_TRANSPORT],
        attraccessVersion: { min: '2.0.0-0' },
      }),
    );
    const service = (limit: number) =>
      `context.ble.registerProfile({ id: 'p', services: [{ uuid: 'fff0', characteristics: [{ key: 'k', uuid: 'fff1', operations: ['read'], maxReadBytes: ${limit} }] }] });`;
    writeFileSync(
      join(fixture.root, 'clash', 'dist', 'index.js'),
      `module.exports = { default: { register: (context) => { ${service(1)} ${service(2)} return { module: class M {} }; } } };`,
    );

    expect(PluginModule.forRoot().imports).toHaveLength(4);
    expect(PluginService.getPluginsWithLoadStatus().find((plugin) => plugin.name === 'clash')?.status).toBe('error');
  });

  it('closes the plugin’s sessions with "shutdown" when its module is destroyed', async () => {
    writePlugin('alpha');
    const module = PluginModule.forRoot();
    const pluginId = required(PluginService.getPlugins().find((plugin) => plugin.name === 'alpha')).id;
    bootstrap();
    const [{ ble }] = loaded(module);
    const created = await ble.createEndpoint(input);
    const session = await ble.openSession(created.id);

    const pluginModule = module.imports.at(-1) as {
      providers: Array<{ provide?: string; useFactory?: () => { onModuleDestroy(): Promise<void> } }>;
    };
    const cleanup = pluginModule.providers.find((provider) => provider.provide === `plugin-mqtt-cleanup:${pluginId}`);
    await required(required(cleanup).useFactory)().onModuleDestroy();

    await expect(session.closed).resolves.toEqual({ reason: 'shutdown' });
    await expect(ble.listEndpoints()).resolves.toHaveLength(1);
  });
});
