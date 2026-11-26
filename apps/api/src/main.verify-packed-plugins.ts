/**
 * CI guard: loads every packed official plugin (`pack` output of the `tag:type:plugin` projects) in a real API host
 * under its npm package name, the way a host installs it from the marketplace. Built by
 * `webpack.config.verify-plugins.js` and run by `pnpm nx run api:verify-packed-plugins`; it never ships.
 *
 * Install goes through `NpmPluginService.install` with no spec (so the host channel decides, as in the marketplace);
 * only the registry's network I/O is answered from the tarballs. Then the host's own `bootstrap()` runs (core and
 * plugin migrations on PostgreSQL, plugin discovery, `AppModule`) and every plugin has to be loaded without a load
 * error or quarantine. `pack-test` only inspects the tarball, so it cannot see what the host refuses at install or load
 * time, for example storage declarations that are invalid under the npm package name.
 *
 * Licensed plugins load because this script grants the license modules they declare; the host's license check is not
 * part of it, but their storage compilation and migrations run.
 *
 * Needs a PostgreSQL server with an administrative connection in TEST_DATABASE_URL (or DATABASE_URL); the guard
 * creates and drops a database of its own.
 */
import { createHash, randomBytes } from 'crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { Client } from 'pg';
import * as tar from 'tar';

const REPO_ROOT = resolve(__dirname, '../../..');
const PLUGINS_ROOT = join(REPO_ROOT, 'apps/plugins');
const REGISTRY = 'https://registry.npmjs.org';

type PackedPlugin = {
  name: string;
  version: string;
  tarball: Buffer;
  integrity: string;
  shasum: string;
  manifest: Record<string, unknown>;
  licenseModules: string[];
};

type PluginManifest = Record<string, unknown> & {
  name: string;
  version: string;
  attraccess?: { license?: { modules?: string[] } };
};

/** One packed tarball per official plugin project. A plugin without one fails loudly: it would go unchecked. */
async function readPackedPlugins(): Promise<PackedPlugin[]> {
  const projects = readdirSync(PLUGINS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(PLUGINS_ROOT, entry.name, 'project.json')))
    .map((entry) => entry.name)
    .filter((name) => {
      const project = JSON.parse(readFileSync(join(PLUGINS_ROOT, name, 'project.json'), 'utf8')) as {
        tags?: string[];
      };
      return project.tags?.includes('type:plugin');
    });
  const packed: PackedPlugin[] = [];
  for (const project of projects) {
    const dist = join(PLUGINS_ROOT, project, 'dist');
    const files = existsSync(dist) ? readdirSync(dist).filter((file) => file.endsWith('.tgz')) : [];
    if (files.length !== 1)
      throw new Error(`apps/plugins/${project}/dist has ${files.length} tarballs; run the pack target of ${project}`);
    const tarball = readFileSync(join(dist, files[0]));
    const unpacked = mkdtempSync(join(tmpdir(), 'packed-plugin-'));
    try {
      await tar.x({ file: join(dist, files[0]), cwd: unpacked, filter: (path) => path === 'package/package.json' });
      const manifest = JSON.parse(readFileSync(join(unpacked, 'package/package.json'), 'utf8')) as PluginManifest;
      packed.push({
        name: manifest.name,
        version: manifest.version,
        tarball,
        integrity: `sha512-${createHash('sha512').update(tarball).digest('base64')}`,
        shasum: createHash('sha1').update(tarball).digest('hex'),
        manifest,
        licenseModules: manifest.attraccess?.license?.modules ?? [],
      });
    } finally {
      rmSync(unpacked, { recursive: true, force: true });
    }
  }
  return packed;
}

function tarballUrl(plugin: PackedPlugin): string {
  return `${REGISTRY}/${plugin.name}/-/${plugin.name.split('/')[1]}-${plugin.version}.tgz`;
}

/** The registry document npm serves for the package: the tarball is both its `latest` and its `next` build. */
function registryDocument(plugin: PackedPlugin) {
  return {
    name: plugin.name,
    'dist-tags': { latest: plugin.version, next: plugin.version },
    versions: {
      [plugin.version]: {
        ...plugin.manifest,
        dist: { tarball: tarballUrl(plugin), integrity: plugin.integrity, shasum: plugin.shasum },
      },
    },
    time: { [plugin.version]: new Date().toISOString() },
  };
}

const settingsStore = {
  getPlainSetting: async () => undefined,
  getSecretSetting: async () => ({ configured: false, value: null }),
  setPlainSetting: async () => undefined,
  setSecretSetting: async () => undefined,
};

async function withDatabase<T>(work: (url: string) => Promise<T>): Promise<T> {
  const adminUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!adminUrl) throw new Error('TEST_DATABASE_URL (an administrative PostgreSQL connection URL) is required');
  const name = `att_packed_plugins_${randomBytes(4).toString('hex')}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  try {
    return await work(url.toString());
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(() => undefined);
    await admin.end();
  }
}

async function verify(): Promise<string[]> {
  const plugins = await readPackedPlugins();
  if (plugins.length === 0) throw new Error('no official plugin projects found');
  const pluginDir = mkdtempSync(join(tmpdir(), 'packed-plugins-host-'));
  try {
    return await withDatabase(async (databaseUrl) => {
      process.env.DATABASE_URL = databaseUrl;
      process.env.DATABASE_TYPE = 'postgres';
      delete process.env.DISABLE_PLUGINS; // any non-empty value, even "false", disables plugins
      process.env.PLUGIN_DIR = pluginDir;
      process.env.STORAGE_ROOT = join(pluginDir, '..', `storage-${randomBytes(4).toString('hex')}`);
      process.env.AUTH_SESSION_SECRET ??= 'verify-packed-plugins-session-secret-0123456789';
      process.env.ATTRACCESS_PLUGIN_CHANNEL = 'next';
      delete process.env.VALKEY_URL;
      delete process.env.PORT;

      // The host reads its environment when its modules load, so they load only after it is set up.
      const { NpmRegistryAccess } = await import('./plugin-system/npm/registry-access');
      const { NpmPluginService } = await import('./plugin-system/npm-plugin.service');
      const { PluginService } = await import('./plugin-system/plugin.service');

      // The registry's network I/O is the only thing answered from the tarballs.
      const documents = new Map(plugins.map((plugin) => [`${REGISTRY}/${encodeURIComponent(plugin.name)}`, plugin]));
      const downloads = new Map(plugins.map((plugin) => [tarballUrl(plugin), plugin]));
      NpmRegistryAccess.prototype.getJson = async (url: string) => {
        const plugin = documents.get(url);
        if (!plugin) throw new Error(`unexpected registry request ${url}`);
        return registryDocument(plugin);
      };
      NpmRegistryAccess.prototype.download = async (url: string) => {
        const plugin = downloads.get(url);
        if (!plugin) throw new Error(`unexpected tarball request ${url}`);
        return plugin.tarball;
      };
      // Installing asks the host to restart; this process keeps going.
      PluginService.prototype.requestRestart = () => undefined;

      PluginService.configure({ PLUGIN_DIR: pluginDir, RESTART_BY_EXIT: false });
      const installer = new NpmPluginService(settingsStore as never);
      const failures: string[] = [];
      for (const plugin of plugins) {
        try {
          // A fresh install, with no spec, the way the marketplace installs it.
          const plan = await installer.installPlan(plugin.name, undefined);
          const installed = await installer.install(plugin.name, undefined, undefined, undefined, plan.token);
          if (installed.requestedSpec !== 'next')
            failures.push(`${plugin.name}: installed with requestedSpec ${installed.requestedSpec}, expected next`);
        } catch (error) {
          failures.push(`${plugin.name}: install failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (failures.length > 0) return failures;

      // Test only: grant the license modules the plugins declare. Everything else of the license gate stays untouched.
      const grant = { valid: true, modules: plugins.flatMap((plugin) => plugin.licenseModules) };
      PluginService.setLicenseSnapshot = (
        (original) => () =>
          original.call(PluginService, grant)
      )(PluginService.setLicenseSnapshot);

      const { bootstrap } = await import('./main.bootstrap');
      const { app } = await bootstrap();
      try {
        await app.init();
        const status = new Map(PluginService.getPluginsWithLoadStatus().map((manifest) => [manifest.name, manifest]));
        for (const plugin of plugins) {
          const manifest = status.get(plugin.name);
          if (manifest?.status !== 'loaded')
            failures.push(
              `${plugin.name}: status ${manifest?.status ?? 'missing'}${manifest?.error ? `: ${manifest.error}` : ''}`,
            );
          else if (PluginService.isPluginQuarantined(manifest)) failures.push(`${plugin.name}: quarantined`);
        }
      } finally {
        await app.close();
      }
      return failures;
    });
  } finally {
    rmSync(pluginDir, { recursive: true, force: true });
  }
}

verify().then(
  (failures) => {
    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `Packed plugins that a real host does not load:\n${failures.map((line) => `  - ${line}`).join('\n')}`,
      );
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log('All packed official plugins install and load in a real host.');
    process.exit(0);
  },
  (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  },
);
