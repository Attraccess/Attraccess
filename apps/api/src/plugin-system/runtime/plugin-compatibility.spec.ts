import {
  assertHostRangeTargetsSdk2,
  assertPluginSupportsBackend,
  assertPluginTargetsSdk2,
  PLUGIN_MIGRATION_GUIDE_URL,
  PluginIncompatibleError,
} from './plugin-compatibility';

describe('plugin SDK 2.0 compatibility gate', () => {
  it.each(['2.0.0-0', '2.0.0', '2.3.1', '3.0.0-beta.1'])('accepts attraccessVersion.min %s', (min) => {
    expect(() => assertPluginTargetsSdk2('p', min)).not.toThrow();
  });

  it.each(['1.11.0-0', '1.0.0', '1.99.0', 'not-a-version', undefined])(
    'refuses attraccessVersion.min %s, naming the plugin and linking the guide',
    (min) => {
      const run = () => assertPluginTargetsSdk2('legacy-plugin', min);
      expect(run).toThrow(PluginIncompatibleError);
      expect(run).toThrow(/legacy-plugin/);
      expect(run).toThrow(PLUGIN_MIGRATION_GUIDE_URL);
    },
  );

  it('judges npm host ranges by their lowest allowed version', () => {
    expect(() => assertHostRangeTargetsSdk2('p', '>=2.0.0-0')).not.toThrow();
    expect(() => assertHostRangeTargetsSdk2('p', '^2.1.0')).not.toThrow();
    expect(() => assertHostRangeTargetsSdk2('p', '*')).toThrow(PluginIncompatibleError);
    expect(() => assertHostRangeTargetsSdk2('p', '^1.9.0')).toThrow(PluginIncompatibleError);
    expect(() => assertHostRangeTargetsSdk2('p', 'garbage')).toThrow(PluginIncompatibleError);
  });

  it('does not echo an unusable plugin name from an untrusted manifest', () => {
    expect(() => assertPluginTargetsSdk2('<script>alert(1)</script>', '1.0.0')).toThrow(/\(unnamed plugin\)/);
  });

  describe('engine support', () => {
    it('lets a plugin without persistence run on any engine', () => {
      expect(() => assertPluginSupportsBackend('p', undefined, false, 'sqlite')).not.toThrow();
    });
    it('requires a declaration from a plugin that stores data', () => {
      expect(() => assertPluginSupportsBackend('p', undefined, true, 'sqlite')).toThrow(/persistence\.backends/);
      expect(() => assertPluginSupportsBackend('p', [], true, 'sqlite')).toThrow(PluginIncompatibleError);
    });
    it('accepts a declared engine and refuses an undeclared one without changing anything', () => {
      expect(() => assertPluginSupportsBackend('p', ['sqlite'], true, 'sqlite')).not.toThrow();
      expect(() => assertPluginSupportsBackend('p', ['postgres'], true, 'sqlite')).toThrow(/no data was changed/);
    });
  });
});
