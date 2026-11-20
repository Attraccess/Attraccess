import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  PLUGIN_CORE_LOOKUP,
  PLUGIN_HOST_CONNECTION,
  PLUGIN_HOST_DATA,
} from '../../../plugin-system/persistence/plugin-host-data.port';
import { PLUGIN_MAINTENANCE_WINDOWS } from '../../../plugin-system/persistence/plugin-maintenance-window.port';
import { PLUGIN_READER_STORE } from '../../../plugin-system/readers/plugin-reader-store.port';
import { PluginPersistenceModule } from './plugin-persistence.module';

const hostConnection = { kind: 'host-connection' } as unknown as DataSource;

@Global()
@Module({ providers: [{ provide: DataSource, useValue: hostConnection }], exports: [DataSource] })
class HostConnectionModule {}

describe('PluginPersistenceModule', () => {
  it('wires the host connection and the persistence-backed lookups of the plugin runtime', async () => {
    const app = await Test.createTestingModule({ imports: [HostConnectionModule, PluginPersistenceModule] }).compile();

    expect(app.get(PLUGIN_HOST_CONNECTION)).toBe(hostConnection);
    const hostData = app.get(PLUGIN_HOST_DATA);
    expect(Object.keys(hostData).sort()).toEqual(['flows', 'resources', 'settings', 'users']);
    expect(Object.keys(app.get(PLUGIN_CORE_LOOKUP)).sort()).toEqual([
      'findRecipients',
      'findResourceSupervision',
      'findUser',
      'listResourceIds',
    ]);
    expect(typeof app.get(PLUGIN_MAINTENANCE_WINDOWS).findWindow).toBe('function');
    expect(typeof app.get(PLUGIN_READER_STORE).findCardOwner).toBe('function');
    await app.close();
  });
});
