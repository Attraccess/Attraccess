import { compilePluginStorage } from './storage-schema';
import { loadBundledPlugins } from '../../database/conformance/plugin-storage/bundled-plugins.test-fixture';

jest.setTimeout(120_000);

/**
 * The marketplace installs the official plugins under their npm package name, whose derived storage namespace
 * (`attraccess_plugin_shelly`) is not the 1.x one (`shelly`) their adopted tables keep. Compiling every bundled
 * declaration under that name catches a plugin whose adopted names the host would refuse (ATT-1402).
 */
describe('bundled plugin storage under the npm package name', () => {
  it.each(['wago', 'matter', 'reservations', 'shelly'])('%s compiles and keeps its 1.x table names', async (name) => {
    const plugin = (await loadBundledPlugins()).find((candidate) => candidate.name === name);
    if (!plugin) throw new Error(`bundled plugin ${name} not found`);
    const options = { reservedTables: new Set<string>() };

    const asNpm = compilePluginStorage(`@attraccess/plugin-${name}`, plugin.storage, options);
    const asZip = compilePluginStorage(name, plugin.storage, options);

    expect([...asNpm.tables.values()].map((table) => table.physical)).toEqual(
      [...asZip.tables.values()].map((table) => table.physical),
    );
  });
});
