import { Test, TestingModule } from '@nestjs/testing';
import type { Type } from '@nestjs/common';
import type { PluginBackendModule, PluginContext } from '@attraccess/plugins-backend-sdk';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { runInThisContext } from 'node:vm';

it('resolves the packaged commissioning and managed-runtime providers to the same Wago service', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wago-packaged-startup-'));
  const bundle = join(directory, 'dist', 'index.js');
  let module: TestingModule | undefined;
  try {
    // Bundled re-exports must not evaluate decorator side effects before their service token is assigned.
    execFileSync(process.execPath, [
      resolve(__dirname, '../../scripts/esbuild-backend.mjs'),
      '--entry',
      resolve(__dirname, 'plugin.ts'),
      '--outfile',
      bundle,
    ]);
    const bundledModule = { exports: {} };
    const load = runInThisContext(
      `(function(require, module, exports, __filename, __dirname) {${await readFile(bundle, 'utf8')}\n})`,
      { filename: bundle },
    );
    // Resolve host packages through the same Jest runtime as Nest's testing module.
    load(require, bundledModule, bundledModule.exports, bundle, dirname(bundle));
    const plugin = (bundledModule.exports as { default: PluginBackendModule }).default;
    const context = {} as PluginContext;
    const registration = plugin.register(context);
    const compiled = await Test.createTestingModule({ imports: [registration] }).compile();
    module = compiled;
    const provider = (name: string) => {
      const token = registration.providers?.find((entry) => typeof entry === 'function' && entry.name === name);
      expect(token).toBeDefined();
      return compiled.get(token as Type<object>);
    };
    const wago = provider('WagoService');
    const managed = provider('WagoManagedRuntimeService');
    const commissioning = provider('WagoCommissioningService');
    expect(Reflect.get(managed, 'wago')).toBe(wago);
    expect(Reflect.get(commissioning, 'wago')).toBe(wago);
    expect(Reflect.get(commissioning, 'managedRuntime')).toBe(managed);
  } finally {
    await module?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
