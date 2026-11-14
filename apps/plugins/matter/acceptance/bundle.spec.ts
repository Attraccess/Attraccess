import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';

// Needs `build-backend` first (the e2e target depends on it).
const bundle = readFileSync(join(__dirname, '../package/dist/index.js'), 'utf8');
const migrations = readFileSync(join(__dirname, '../package/dist/migrations.js'), 'utf8');

const requiredModules = (source: string) => [...source.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]);
const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
// Provided by the host at run time, so they must not be bundled (see apps/plugins/scripts/esbuild-backend.mjs).
const hostShared = new Set([
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/event-emitter',
  'eventemitter2',
  'typeorm',
  'reflect-metadata',
  '@attraccess/plugins-backend-sdk',
]);
// ws loads these inside a try/catch and falls back to plain JavaScript.
const optionalNative = new Set(['bufferutil', 'utf-8-validate']);

describe('Matter plugin bundle', () => {
  it('bundles the contract and its runtime dependencies (zod, semver, ws) instead of requiring them', () => {
    const unexpected = requiredModules(bundle).filter(
      (name) => !nodeBuiltins.has(name) && !hostShared.has(name) && !optionalNative.has(name),
    );
    expect(unexpected).toEqual([]);
    expect(bundle).toContain('unsupported_wire_version'); // the contract is in the bundle
    expect(bundle).toMatch(/class Parser|WebSocketServer|permessage-deflate/); // ws is in the bundle
  });

  it('contains no matter.js and no core imports', () => {
    expect(bundle).not.toMatch(/@matter\//);
    expect(bundle).not.toMatch(/apps\/api|database-entities|@attraccess\/shared/);
    expect([...new Set(requiredModules(bundle).filter((name) => name.startsWith('@attraccess/')))]).toEqual([
      '@attraccess/plugins-backend-sdk',
    ]);
  });

  it('leaves the optional native ws accelerators unresolved, guarded by ws itself', () => {
    for (const name of requiredModules(bundle).filter((module) => optionalNative.has(module))) {
      const index = bundle.indexOf(`require("${name}")`);
      expect(bundle.slice(Math.max(0, index - 200), index)).toMatch(/try\s*\{/);
    }
  });

  it('never disables certificate verification', () => {
    expect(bundle).not.toMatch(/rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/);
  });

  describe('loads as a plugin module', () => {
    const bundlePath = join(__dirname, '../package/dist/index.js');
    /** Loads a fresh copy of the bundle; `nativeModule` answers its `require("bufferutil")`/`("utf-8-validate")`. */
    function loadWith(nativeModule: (name: string) => unknown) {
      const requested: string[] = [];
      let loaded: { default: { register(context: unknown): { controllers: unknown[] } } } | undefined;
      jest.isolateModules(() => {
        for (const name of optionalNative) {
          jest.doMock(
            name,
            () => {
              requested.push(name);
              return nativeModule(name);
            },
            { virtual: true },
          );
        }
        loaded = require(bundlePath);
      });
      for (const name of optionalNative) jest.dontMock(name);
      return { plugin: (loaded as NonNullable<typeof loaded>).default, requested };
    }
    const expectUsable = (plugin: ReturnType<typeof loadWith>['plugin']) => {
      expect(plugin.register({}).controllers).toHaveLength(2);
      expect((plugin as unknown as { entities: unknown[] }).entities).toHaveLength(9);
      expect((plugin as unknown as { auditDomains: { domain: string }[] }).auditDomains[0].domain).toBe('matter');
    };

    // ws only asks for utf-8-validate when Node lacks buffer.isUtf8 (before 18.14), so on supported Node versions
    // bufferutil is the accelerator that is actually looked up.
    it('without the optional native modules installed', () => {
      const { plugin, requested } = loadWith((name) => {
        throw Object.assign(new Error(`Cannot find module '${name}'`), { code: 'MODULE_NOT_FOUND' });
      });
      expect(requested).toContain('bufferutil');
      expectUsable(plugin);
    });

    it('with the optional native modules installed', () => {
      const accelerator = { mask: jest.fn(), unmask: jest.fn(), isValidUTF8: jest.fn(() => true) };
      const { plugin, requested } = loadWith(() => accelerator);
      expect(requested).toContain('bufferutil');
      expectUsable(plugin);
    });
  });

  it('ships the migration as a separate entry', () => {
    expect(migrations).toContain('CreateMatterConnection1793900000000');
    expect(requiredModules(migrations).filter((name) => !nodeBuiltins.has(name) && !hostShared.has(name))).toEqual([]);
  });
});
