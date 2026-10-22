describe('neutral SDK entry and legacy SQLite identity', () => {
  it('loads the neutral application entry without loading the ORM', () => {
    jest.isolateModules(() => {
      jest.doMock('typeorm', () => {
        throw new Error('The neutral SDK attempted to load TypeORM');
      });
      try {
        const sdk = require('../../v2') as typeof import('../../v2');
        expect(sdk.ResourceType.Machine).toBe('machine');
        expect(sdk.PLUGIN_CONTEXT).toBe(Symbol.for('attraccess.plugin.context'));
        expect(sdk).not.toHaveProperty('DataSource');
        expect(sdk).not.toHaveProperty('Entity');
        expect(sdk).not.toHaveProperty('User');
      } finally {
        jest.dontMock('typeorm');
      }
    });
  });

  it('shares canonical values and injection tokens with retained legacy entry points', () => {
    const neutral = require('../../v2') as typeof import('../../v2');
    const legacy = require('../../index') as typeof import('../../index');
    expect(legacy.ResourceType).toBe(neutral.ResourceType);
    expect(legacy.ResourceFlowNodeType).toBe(neutral.ResourceFlowNodeType);
    expect(legacy.getNodeDataSchema).toBe(neutral.getNodeDataSchema);
    expect(legacy.PLUGIN_CONTEXT).toBe(neutral.PLUGIN_CONTEXT);
    expect(legacy.PluginPermission).toBe(neutral.PluginPermission);
    expect(legacy.SystemEvent).toBe(neutral.SystemEvent);
    expect(legacy.User).toEqual(expect.any(Function));
  });

  it('does not resolve different operation tokens merely because their descriptions match', () => {
    const { pluginOperationToken } = require('../../v2') as typeof import('../../v2');
    const first = pluginOperationToken<{ read(): string }>('device operations', ['read']);
    const second = pluginOperationToken<{ read(): string }>('device operations', ['read']);
    expect(first.id).not.toBe(second.id);
    expect(Object.isFrozen(first)).toBe(true);
  });
});
