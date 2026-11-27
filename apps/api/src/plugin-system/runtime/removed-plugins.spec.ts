import { PluginBleError } from '@attraccess/plugins-backend-sdk';
import { createPluginBleContext } from '../ble/plugin-ble-context';
import type { PluginBleService } from '../ble/plugin-ble.service';
import { createPluginReadersContext } from '../readers/plugin-readers-context';
import type { PluginReadersService } from '../readers/plugin-readers.service';
import { clearRemovedPlugins, isPluginRemoved, markPluginRemoved } from './removed-plugins';

const silent = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };

describe('removed plugins', () => {
  afterEach(() => clearRemovedPlugins());

  it('refuses reader calls of a removed plugin before they reach the host', async () => {
    const readers = { get: jest.fn(), list: jest.fn().mockResolvedValue([]) };
    const context = createPluginReadersContext('plugin-a', () => readers as unknown as PluginReadersService);
    markPluginRemoved('plugin-a');

    await expect(context.get('device-1')).rejects.toThrow(/removed/);
    await expect(context.list()).rejects.toThrow(/removed/);
    expect(readers.get).not.toHaveBeenCalled();
    expect(readers.list).not.toHaveBeenCalled();
  });

  it('refuses BLE calls of a removed plugin and leaves other plugins alone', async () => {
    const service = { createEndpoint: jest.fn(), listReaders: jest.fn().mockResolvedValue([]) };
    const resolve = () => service as unknown as PluginBleService;
    const removed = createPluginBleContext({ id: 'plugin-a', logger: silent }, resolve);
    const other = createPluginBleContext({ id: 'plugin-b', logger: silent }, resolve);
    markPluginRemoved('plugin-a');

    const refused = removed.createEndpoint({
      readerId: 1,
      address: 'AA:BB:CC:DD:EE:FF',
      addressType: 'public',
      profileId: 'demo',
    });
    await expect(refused).rejects.toBeInstanceOf(PluginBleError);
    await expect(refused).rejects.toMatchObject({ code: 'OPERATION_NOT_ALLOWED' });
    expect(service.createEndpoint).not.toHaveBeenCalled();
    await expect(other.listReaders()).resolves.toEqual([]);
  });

  it('forgets removals when the plugin system is configured again', () => {
    markPluginRemoved('plugin-a');
    clearRemovedPlugins();
    expect(isPluginRemoved('plugin-a')).toBe(false);
  });
});
