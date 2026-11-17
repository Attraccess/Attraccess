import { describe, expect, it } from 'vitest';
import { groupPermissionsByCategory } from './groupPermissionsByCategory';

describe('groupPermissionsByCategory', () => {
  it('orders core categories first, then plugin categories by plugin name', () => {
    const groups = groupPermissionsByCategory([
      { key: 'rabbitmq.broker.read', category: 'plugin:rabbitmq', pluginName: 'rabbitmq' },
      { key: 'billing.read', category: 'billing', pluginName: null },
      { key: 'matter.devices.read', category: 'plugin:matter', pluginName: 'matter' },
      { key: 'resources.read', category: 'resources', pluginName: null },
      { key: 'thread.network.read', category: 'plugin:matter', pluginName: 'matter' },
    ]);

    expect(groups.map(({ category }) => category)).toEqual([
      'resources',
      'billing',
      'plugin:matter',
      'plugin:rabbitmq',
    ]);
    expect(groups[2].permissions.map(({ key }) => key)).toEqual(['matter.devices.read', 'thread.network.read']);
  });
});
