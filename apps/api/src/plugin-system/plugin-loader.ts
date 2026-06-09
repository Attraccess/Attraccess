import { createRequire, Module as NodeModuleClass } from 'module';
import { readFileSync } from 'fs';
import { runInThisContext } from 'vm';
import { dirname, isAbsolute } from 'path';

// Loads a plugin's CommonJS entry so that its *externalized* host-shared packages
// (@nestjs/common, typeorm, reflect-metadata, …) resolve to the host's single
// copy. Plugins deliberately do not bundle those packages — a bundled copy is a
// different class/symbol object and breaks DI token identity, constructor-metadata
// reflection AND TypeORM type identity (a migration's `QueryRunner`/`MigrationInterface`
// must be the host's, see docs/en/plugins/developing-plugins.md "Packaging the backend").
// The shipped entry therefore does bare `require('typeorm')` etc. at runtime.
//
// Two failure modes have to be avoided at once:
//   1. Resolution — in a production image the plugin lives under
//      STORAGE_ROOT/plugins/… while the host's node_modules sits under
//      dist/apps/api/, so a bare require resolved relative to the plugin's own
//      directory finds nothing ("Cannot find module '@nestjs/common'").
//   2. Identity — the loaded module must be the very same object the host uses,
//      AND the plugin's decorators must run against the same global `Reflect`
//      the host reads. Handing the entry to Node's own loader (`new Module().
//      load()`) compiles it in a separate realm: its `__decorate`/`Reflect.
//      metadata` writes land on a different `Reflect`/metadata registry, so DI
//      sees no constructor dependencies and injections come back undefined.
//
// We satisfy both by compiling the entry in *this* realm with `vm.
// runInThisContext` (so decorator metadata is written to the same `Reflect`
// the host reads) and handing it a `require` that routes every *bare*
// specifier — i.e. the externalized host-shared packages — to the host's own
// require, returning the host's already-loaded instances regardless of where
// the plugin lives on disk. Relative/absolute requests stay plugin-local.
export function loadPluginEntryExports(entryFile: string): Record<string, unknown> & { default?: unknown } {
  const NodeModule = NodeModuleClass as unknown as {
    wrap(script: string): string;
    _nodeModulePaths(from: string): string[];
    new (id: string, parent?: unknown): {
      filename: string;
      paths: string[];
      exports: Record<string, unknown> & { default?: unknown };
      require(request: string): unknown;
    };
  };

  const hostRequire = createRequire(__filename);
  const isBareSpecifier = (request: string): boolean => !request.startsWith('.') && !isAbsolute(request);

  const pluginModule = new NodeModule(entryFile, module);
  pluginModule.filename = entryFile;
  pluginModule.paths = NodeModule._nodeModulePaths(dirname(entryFile));

  const pluginRequire = ((request: string): unknown =>
    isBareSpecifier(request) ? hostRequire(request) : pluginModule.require(request)) as NodeJS.Require;
  pluginRequire.resolve = hostRequire.resolve;

  const compiled = runInThisContext(NodeModule.wrap(readFileSync(entryFile, 'utf8')), { filename: entryFile });
  compiled.call(pluginModule.exports, pluginModule.exports, pluginRequire, pluginModule, entryFile, dirname(entryFile));

  return pluginModule.exports;
}
