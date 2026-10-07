import 'reflect-metadata';

import { PluginModule } from './plugin.module';
import { registerPluginModuleFixture } from './plugin.module.plugin-module.test-fixture';
export function registerRequireRefCases(_fixture: ReturnType<typeof registerPluginModuleFixture>) {
  describe('requireRef', () => {
    const requireRef = (PluginModule as unknown as { requireRef<T>(ref: T | null, name: string): T }).requireRef;

    it('throws a bootstrap-ordering error when a host singleton is missing', () => {
      expect(() => requireRef(null, 'EventEmitter2')).toThrow(/accessed before bootstrap completed/);
    });

    it('returns the reference when it is available', () => {
      const ref = {};
      expect(requireRef(ref, 'DataSource')).toBe(ref);
    });
  });
}
