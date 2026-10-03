import {
  PluginDependenciesSchema,
  orderPluginDependencies,
  pluginActivationPlan,
  pluginRemovalClosure,
  resolvePluginDependencies,
} from './plugin-dependencies';

const dependency = (name: string, version = '^1.0.0', required = true) => ({ name, version, required });
const plugin = (name: string, dependencies = [], version = '1.0.0') => ({ name, version, dependencies });

describe('plugin dependency graph', () => {
  it('requires immutable package identities and semver ranges, independently of npm dependencies', () => {
    expect(PluginDependenciesSchema.parse([{ name: '@vendor/core', version: '^1.0.0' }])[0].required).toBe(true);
    for (const entry of [
      dependency('https://registry/core'),
      dependency('core', 'latest'),
      dependency('core', 'file:../core'),
    ]) {
      expect(() => PluginDependenciesSchema.parse([entry])).toThrow();
    }
    expect(() => PluginDependenciesSchema.parse([dependency('core'), dependency('core')])).toThrow();
  });

  it('resolves shared transitive requirements by backtracking and uses installed versions', async () => {
    const root = plugin('provider', [dependency('left'), dependency('right')]);
    const options = {
      left: [plugin('left', [dependency('core', '^2')], '1.1.0'), plugin('left', [dependency('core')])],
      right: [plugin('right', [dependency('core')])],
      core: [plugin('core', [], '2.0.0'), plugin('core')],
    };
    const candidates = jest.fn(async (name) => options[name]);
    const resolved = await resolvePluginDependencies(root, [plugin('core')], candidates);
    expect(resolved.map(({ name }) => name)).toEqual(['core', 'left', 'right', 'provider']);
    expect(resolved.find(({ name }) => name === 'left').version).toBe('1.0.0');
    expect(candidates).not.toHaveBeenCalledWith('core');
  });

  it('rejects cycles, range conflicts, missing packages and incompatible updates', async () => {
    await expect(
      resolvePluginDependencies(plugin('a', [dependency('b')]), [], async () => [plugin('b', [dependency('a')])]),
    ).rejects.toThrow('a → b → a');
    await expect(
      resolvePluginDependencies(plugin('a', [dependency('core', '^2')]), [plugin('core')], async () => []),
    ).rejects.toThrow('a requires core@^2');
    await expect(resolvePluginDependencies(plugin('a', [dependency('core')]), [], async () => [])).rejects.toThrow(
      'No compatible plugin version',
    );
    await expect(
      resolvePluginDependencies(
        plugin('core', [], '2.0.0'),
        [plugin('provider', [dependency('core')]), plugin('core')],
        async () => [],
      ),
    ).rejects.toThrow('provider requires core');
  });

  it('does not install or activate optional dependencies but checks their versions when present', async () => {
    const root = plugin('a', [dependency('core', '^1', false)]);
    const candidates = jest.fn();
    expect(await resolvePluginDependencies(root, [], candidates)).toEqual([root]);
    expect(candidates).not.toHaveBeenCalled();
    expect(() => orderPluginDependencies([root, plugin('core', [], '2.0.0')])).toThrow('requires core');
  });

  it('orders valid activation components and isolates cycles and missing dependencies', () => {
    const { ordered, failures } = pluginActivationPlan([
      plugin('provider', [dependency('core')]),
      plugin('core'),
      plugin('missing', [dependency('absent')]),
      plugin('a', [dependency('b')]),
      plugin('b', [dependency('a')]),
      plugin('independent'),
    ]);
    expect(ordered.map(({ name }) => name)).toEqual(['core', 'provider', 'independent']);
    expect([...failures.keys()]).toEqual(['missing', 'a', 'b']);
  });

  it('includes direct and transitive dependants in a removal, retaining optional dependants', () => {
    expect(
      pluginRemovalClosure('core', [
        plugin('core'),
        plugin('provider', [dependency('core')]),
        plugin('addon', [dependency('provider')]),
        plugin('optional', [dependency('core', '*', false)]),
      ]).map(({ name }) => name),
    ).toEqual(['core', 'provider', 'addon']);
  });
});
