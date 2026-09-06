import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import plugin from './plugin';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoCommissioningService } from './wago-commissioning.service';

it('boots the commissioning plugin and empty artifact catalog without privileged host-provider resolution', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wago-startup-fixture-'));
  const storage = process.env.STORAGE_ROOT;
  process.env.STORAGE_ROOT = directory;
  const dataSource = new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: plugin.entities,
    synchronize: true,
  });
  const get = jest.fn(() => {
    throw new Error('RESOLVE_HOST_PROVIDERS not granted');
  });
  const context = {
    dataSource,
    getRepository: (entity) => dataSource.getRepository(entity),
    get,
    secrets: { encrypt: (value: string) => `fixture:${value}`, decrypt: (value: string) => value.slice(8) },
    mqtt: { subscribe: jest.fn().mockResolvedValue({ unsubscribe: jest.fn() }), publish: jest.fn() },
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  } as unknown as PluginContext;
  let module: TestingModule | undefined;
  try {
    await dataSource.initialize();
    module = await Test.createTestingModule({ imports: [plugin.register(context)] }).compile();
    await module.init();
    expect(await module.get(WagoRuntimeArtifactsService).current()).toBeNull();
    expect(await module.get(WagoCommissioningService).support()).toMatchObject({
      firmwareBaseline: '31',
      ready: false,
    });
    expect(get).not.toHaveBeenCalled();
    expect(context.mqtt.subscribe).not.toHaveBeenCalled();
  } finally {
    await module?.close();
    if (dataSource.isInitialized) await dataSource.destroy();
    if (storage === undefined) delete process.env.STORAGE_ROOT;
    else process.env.STORAGE_ROOT = storage;
    await rm(directory, { recursive: true, force: true });
  }
});
