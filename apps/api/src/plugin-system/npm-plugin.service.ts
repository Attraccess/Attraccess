import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import decompress from 'decompress';
import decompressTargz from 'decompress-targz';
import { createHash, randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { SettingsStoreService } from '../settings/settings-store.service';
import { resolveAppVersion } from '../config/app.config';
import { PluginService } from './plugin.service';
import { parseNpmPluginPackage } from './npm-plugin-contract';

const REGISTRY_PARENT = 'plugin-registry';
const REGISTRIES_KEY = 'registries';
const STATE_FILE = '.npm-plugin-state.json';
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 200 * 1024 * 1024;

type StoredRegistry = { id: string; name: string; url: string };
type Registry = StoredRegistry & { token: string | null };
type PackageVersion = { version: string; dist: { tarball: string; integrity?: string; shasum?: string } };

export type InstalledNpmPlugin = {
  name: string;
  version: string;
  registryId: string;
  registryUrl: string;
  integrity: string;
  installPath: string;
  permissions: string[];
  lastError: string | null;
};

@Injectable()
export class NpmPluginService {
  constructor(
    private readonly settings: SettingsStoreService,
  ) {}

  async listRegistries(): Promise<Array<StoredRegistry & { tokenConfigured: boolean }>> {
    const registries = await this.storedRegistries();
    return Promise.all(registries.map(async (registry) => ({
      ...registry,
      tokenConfigured: (await this.settings.getSecretSetting(REGISTRY_PARENT, `${registry.id}:token`)).configured,
    })));
  }

  async addRegistry(input: { name: string; url: string; token?: string | null }): Promise<StoredRegistry & { tokenConfigured: boolean }> {
    const registry: StoredRegistry = { id: randomUUID(), name: input.name.trim(), url: normalizeRegistryUrl(input.url) };
    if (!registry.name) throw new BadRequestException('Registry name is required');
    const registries = await this.storedRegistries();
    if (registries.some(({ url }) => url === registry.url)) throw new BadRequestException('Registry URL is already configured');
    await this.settings.setPlainSetting(REGISTRY_PARENT, REGISTRIES_KEY, JSON.stringify([...registries, registry]));
    if (input.token !== undefined) await this.settings.setSecretSetting(REGISTRY_PARENT, `${registry.id}:token`, input.token);
    return { ...registry, tokenConfigured: input.token != null && input.token.trim().length > 0 };
  }

  async removeRegistry(id: string): Promise<void> {
    const registries = await this.storedRegistries();
    if (!registries.some((registry) => registry.id === id)) throw new NotFoundException('Registry not found');
    await this.settings.setPlainSetting(REGISTRY_PARENT, REGISTRIES_KEY, JSON.stringify(registries.filter((registry) => registry.id !== id)));
    await this.settings.setSecretSetting(REGISTRY_PARENT, `${id}:token`, null);
  }

  async testRegistry(id: string): Promise<void> {
    const registry = await this.registry(id);
    await this.getJson(`${registry.url}/-/ping`, registry);
  }

  async packageMetadata(name: string, registryId?: string): Promise<unknown> {
    const registry = await this.registry(registryId);
    return this.getJson(`${registry.url}/${encodeURIComponent(name)}`, registry);
  }

  async packageVersions(name: string, registryId?: string): Promise<string[]> {
    const metadata = await this.packageMetadata(name, registryId) as { versions?: Record<string, unknown> };
    return Object.keys(metadata.versions ?? {}).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  }

  async install(name: string, version: string, registryId?: string): Promise<InstalledNpmPlugin> {
    const registry = await this.registry(registryId);
    const metadata = await this.packageMetadata(name, registry.id) as { versions?: Record<string, PackageVersion> };
    const packageVersion = metadata.versions?.[version];
    if (!packageVersion || packageVersion.version !== version) throw new NotFoundException('Package version not found');
    if (!packageVersion.dist.integrity && !packageVersion.dist.shasum) throw new BadRequestException('Registry did not provide tarball integrity metadata');

    const tarball = await this.download(packageVersion.dist.tarball, registry);
    verifyIntegrity(tarball, packageVersion.dist);
    const staging = await mkdtemp(join(PluginService.PLUGIN_PATH, '.npm-staging-'));
    try {
      await decompress(tarball, staging, {
        plugins: [decompressTargz()],
        filter: (file) => {
          if (!safeArchivePath(file.path)) throw new BadRequestException('Tarball contains an unsafe path');
          return true;
        },
      });
      const source = join(staging, 'package');
      await validateExtractedTree(source);
      const packageJsonPath = join(source, 'package.json');
      if (!existsSync(packageJsonPath)) throw new BadRequestException('Tarball does not contain package/package.json');
      const { manifest } = parseNpmPluginPackage(JSON.parse(readFileSync(packageJsonPath, 'utf8')), this.hostVersion());
      if (manifest.name !== name || manifest.version !== version) throw new BadRequestException('Tarball package identity does not match the requested package');
      validateEntries(source, manifest);
      await writeFile(join(source, 'plugin.json'), JSON.stringify(manifest));

      const installed: InstalledNpmPlugin = {
        name,
        version,
        registryId: registry.id,
        registryUrl: registry.url,
        integrity: packageVersion.dist.integrity ?? `sha1-${packageVersion.dist.shasum}`,
        installPath: pluginDirectory(name),
        permissions: manifest.permissions,
        lastError: null,
      };
      await this.activate(source, name);
      await this.writeState(installed);
      new PluginService().requestRestart();
      return installed;
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  listInstalled(): InstalledNpmPlugin[] {
    const statePath = join(PluginService.PLUGIN_PATH, STATE_FILE);
    if (!existsSync(statePath)) return [];
    try { return JSON.parse(readFileSync(statePath, 'utf8')); } catch { return []; }
  }

  private async activate(source: string, name: string): Promise<void> {
    await mkdir(PluginService.PLUGIN_PATH, { recursive: true });
    const target = join(PluginService.PLUGIN_PATH, pluginDirectory(name));
    const backup = join(PluginService.PLUGIN_PATH, `.npm-backup-${randomUUID()}`);
    if (existsSync(target)) await rename(target, backup);
    try {
      await rename(source, target);
      await rm(backup, { recursive: true, force: true });
    } catch (error) {
      if (existsSync(backup) && !existsSync(target)) await rename(backup, target);
      throw error;
    }
  }

  private async writeState(installed: InstalledNpmPlugin): Promise<void> {
    const records = this.listInstalled().filter(({ name }) => name !== installed.name);
    await writeFile(join(PluginService.PLUGIN_PATH, STATE_FILE), JSON.stringify([...records, installed]));
  }

  private async registry(id?: string): Promise<Registry> {
    if (!id || id === 'npm') return { id: 'npm', name: 'npm', url: 'https://registry.npmjs.org', token: null };
    const stored = (await this.storedRegistries()).find((registry) => registry.id === id);
    if (!stored) throw new NotFoundException('Registry not found');
    const { value: token } = await this.settings.getSecretSetting(REGISTRY_PARENT, `${id}:token`);
    return { ...stored, token };
  }

  private async storedRegistries(): Promise<StoredRegistry[]> {
    const raw = await this.settings.getPlainSetting(REGISTRY_PARENT, REGISTRIES_KEY);
    if (!raw) return [];
    try { return zodRegistries(JSON.parse(raw)); } catch { return []; }
  }

  private async getJson(url: string, registry: Registry): Promise<unknown> {
    const response = await axios.get(url, { headers: registry.token ? { authorization: `Bearer ${registry.token}` } : undefined, timeout: 10_000 });
    return response.data;
  }

  private async download(url: string, registry: Registry): Promise<Buffer> {
    const registryHost = new URL(registry.url).host;
    const tarballHost = new URL(url).host;
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer', timeout: 30_000, maxContentLength: MAX_ARCHIVE_BYTES,
      headers: registry.token && tarballHost === registryHost ? { authorization: `Bearer ${registry.token}` } : undefined,
      beforeRedirect: (options) => { if (options.host !== registryHost) delete options.headers.authorization; },
    });
    return Buffer.from(response.data);
  }

  private hostVersion(): string { return resolveAppVersion(); }
}

function normalizeRegistryUrl(value: string): string { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('Registry URL must use HTTP(S)'); return url.toString().replace(/\/$/, ''); }
function pluginDirectory(name: string): string { return `npm-${Buffer.from(name).toString('base64url')}`; }
function zodRegistries(value: unknown): StoredRegistry[] { if (!Array.isArray(value)) throw new Error(); return value.map((entry) => { if (!entry || typeof entry !== 'object') throw new Error(); const item = entry as StoredRegistry; return { id: item.id, name: item.name, url: normalizeRegistryUrl(item.url) }; }); }
function safeArchivePath(value: string): boolean { return !value.startsWith('/') && !value.split('/').includes('..'); }
async function validateExtractedTree(root: string): Promise<void> { if (!existsSync(root)) throw new BadRequestException('Tarball has no package directory'); const rootPath = resolve(root); let total = 0; const entries = await import('fs/promises').then(({ readdir }) => readdir(root, { recursive: true, withFileTypes: true })); for (const entry of entries) { if (entry.isSymbolicLink()) throw new BadRequestException('Tarball may not contain symbolic links'); if (entry.isFile()) { const path = resolve(root, entry.parentPath, entry.name); if (!path.startsWith(`${rootPath}/`)) throw new BadRequestException('Tarball contains an unsafe path'); total += (await stat(path)).size; if (total > MAX_EXTRACTED_BYTES) throw new BadRequestException('Tarball exceeds the extracted size limit'); } } }
function validateEntries(root: string, manifest: { main: { backend?: { directory: string; entryPoint: string }; frontend?: { directory: string; entryPoint: string; styles?: string }; migrations?: { directory: string; entryPoint: string } } }): void { for (const entry of [manifest.main.backend, manifest.main.frontend, manifest.main.migrations]) { if (entry && !existsSync(join(root, entry.directory, entry.entryPoint))) throw new BadRequestException('Package declares an entry point that is not present'); } if (manifest.main.frontend?.styles && !existsSync(join(root, manifest.main.frontend.directory, manifest.main.frontend.styles))) throw new BadRequestException('Package declares styles that are not present'); }
function verifyIntegrity(buffer: Buffer, dist: PackageVersion['dist']): void { if (dist.integrity) { const match = /^(sha(?:256|384|512))-(.+)$/.exec(dist.integrity); if (!match || createHash(match[1]).update(buffer).digest('base64') !== match[2]) throw new BadRequestException('Tarball integrity check failed'); return; } if (createHash('sha1').update(buffer).digest('hex') !== dist.shasum) throw new BadRequestException('Tarball integrity check failed'); }
