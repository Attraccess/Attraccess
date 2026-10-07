import { registerPluginModuleFixture } from './plugin.module.plugin-module.test-fixture';
import { registerForRootCases } from './plugin.module.plugin-module.for-root.test-cases';
import { registerCreatePluginContextCases } from './plugin.module.plugin-module.create-plugin-context.test-cases';
import { registerRequireRefCases } from './plugin.module.plugin-module.require-ref.test-cases';
describe('PluginModule', () => {
  const fixture = registerPluginModuleFixture();
  registerForRootCases(fixture);
  registerCreatePluginContextCases(fixture);
  registerRequireRefCases(fixture);
});
