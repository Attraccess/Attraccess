import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import axios from 'axios';
import { createHash, randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { lookup } from 'dns/promises';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'fs/promises';
import ipaddr from 'ipaddr.js';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import * as tar from 'tar';
import { SettingsStoreService } from '../settings/settings-store.service';
import { resolveAppVersion } from '../config/app.config';
import { PluginService } from './plugin.service';
import { NpmPluginPackage, parseNpmPluginPackage } from './npm-plugin-contract';
import { PluginClassificationService } from './plugin-classification.service';

const REGISTRY_PARENT = 'plugin-registry';
const REGISTRIES_KEY = 'registries';
const STATE_FILE = '.npm-plugin-state.json';
const BACKUP_DIRECTORY = '.npm-backups';
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_METADATA_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 200 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 10_000;

export type StoredRegistry = { id: string; name: string; url: string };
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

export type MarketplacePlugin = {
  name: string;
  version: string | null;
  displayName: string | null;
  description: string | null;
  permissions: string[];
  hostRange: string | null;
  repository: string | null;
  homepage: string | null;
  license: string | null;
  publisher: string | null;
  deprecated: boolean;
  registry: StoredRegistry;
  classification: 'official' | 'community';
  classificationReason: string;
  installable: boolean;
  incompatibilityReason: string | null;
  integrity: string | null;
};

@Injectable()
export class NpmPluginService {
  private readonly logger = new Logger(NpmPluginService.name);
  private registryMutation = Promise.resolve();
  private installMutation = Promise.resolve();

  constructor(
    private readonly settings: SettingsStoreService,
    @Optional() classification?: PluginClassificationService,
  ) {
    this.classification = classification ?? new PluginClassificationService();
  }

  private readonly classification: PluginClassificationService;

  async listRegistries(): Promise<Array<StoredRegistry & { tokenConfigured: boolean }>> {
    const registries = await this.storedRegistries();
    return Promise.all(
      registries.map(async (registry) => ({
        ...registry,
        tokenConfigured: (await this.settings.getSecretSetting(REGISTRY_PARENT, `${registry.id}:token`)).configured,
      })),
    );
  }

  async addRegistry(input: {
    name: string;
    url: string;
    token?: string | null;
  }): Promise<StoredRegistry & { tokenConfigured: boolean }> {
    const registry: StoredRegistry = {
      id: randomUUID(),
      name: input.name.trim(),
      url: normalizeRegistryUrl(input.url),
    };
    if (!registry.name) throw new BadRequestException('Registry name is required');
    await this.mutateRegistries(async (registries) => {
      if (registries.some(({ url }) => url === registry.url))
        throw new BadRequestException('Registry URL is already configured');
      if (input.token !== undefined)
        await this.settings.setSecretSetting(REGISTRY_PARENT, `${registry.id}:token`, input.token);
      try {
        await this.settings.setPlainSetting(REGISTRY_PARENT, REGISTRIES_KEY, JSON.stringify([...registries, registry]));
      } catch (error) {
        if (input.token !== undefined)
          await this.settings.setSecretSetting(REGISTRY_PARENT, `${registry.id}:token`, null);
        throw error;
      }
    });
    return { ...registry, tokenConfigured: input.token != null && input.token.trim().length > 0 };
  }

  async removeRegistry(id: string): Promise<void> {
    await this.mutateRegistries(async (registries) => {
      if (!registries.some((registry) => registry.id === id)) {
        // A prior removal may have persisted the registry change before token cleanup failed.
        await this.settings.setSecretSetting(REGISTRY_PARENT, `${id}:token`, null);
        return;
      }
      await this.settings.setPlainSetting(
        REGISTRY_PARENT,
        REGISTRIES_KEY,
        JSON.stringify(registries.filter((registry) => registry.id !== id)),
      );
      await this.settings.setSecretSetting(REGISTRY_PARENT, `${id}:token`, null);
    });
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
    const metadata = (await this.packageMetadata(name, registryId)) as { versions?: Record<string, unknown> };
    return Object.keys(metadata.versions ?? {}).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  }

  async searchMarketplace(query: string, registryId?: string): Promise<{ results: MarketplacePlugin[]; errors: string[] }> {
    const registries = registryId ? [await this.registry(registryId)] : await this.searchRegistries();
    const responses = await Promise.all(
      registries.map(async (registry) => {
        try {
          const search = (await this.getJson(
            `${registry.url}/-/v1/search?text=${encodeURIComponent(`keywords:attraccess-plugin ${query.trim()}`)}&size=20`,
            registry,
          )) as { objects?: Array<{ package?: unknown }> };
          return { results: (search.objects ?? []).map(({ package: pkg }) => this.marketplacePlugin(pkg, registry)), error: null };
        } catch {
          return { results: [], error: `Could not search ${registry.name}` };
        }
      }),
    );
    return {
      results: responses.flatMap(({ results }) => results),
      errors: responses.flatMap(({ error }) => (error ? [error] : [])),
    };
  }

  async marketplacePackage(name: string, registryId?: string): Promise<MarketplacePlugin> {
    const registry = await this.registry(registryId);
    const metadata = (await this.packageMetadata(name, registry.id)) as {
      name?: string;
      'dist-tags'?: { latest?: string };
      versions?: Record<string, unknown>;
    };
    const version = metadata['dist-tags']?.latest;
    const pkg = version ? metadata.versions?.[version] : undefined;
    if (!pkg) throw new NotFoundException('Package has no latest version');
    return this.marketplacePlugin(pkg, registry);
  }

  async install(name: string, version: string, registryId?: string): Promise<InstalledNpmPlugin> {
    const registry = await this.registry(registryId);
    const metadata = (await this.packageMetadata(name, registry.id)) as { versions?: Record<string, PackageVersion> };
    const packageVersion = metadata.versions?.[version];
    if (!packageVersion || packageVersion.version !== version) throw new NotFoundException('Package version not found');
    if (!packageVersion.dist.integrity && !packageVersion.dist.shasum)
      throw new BadRequestException('Registry did not provide tarball integrity metadata');

    const tarball = await this.download(packageVersion.dist.tarball, registry);
    verifyIntegrity(tarball, packageVersion.dist);
    await mkdir(PluginService.PLUGIN_PATH, { recursive: true });
    const staging = await mkdtemp(join(PluginService.PLUGIN_PATH, '.npm-staging-'));
    try {
      await extractTarball(tarball, staging);
      const source = join(staging, 'package');
      const packageJsonPath = join(source, 'package.json');
      if (!existsSync(packageJsonPath)) throw new BadRequestException('Tarball does not contain package/package.json');
      const { manifest } = parseNpmPluginPackage(JSON.parse(readFileSync(packageJsonPath, 'utf8')), this.hostVersion());
      if (manifest.name !== name || manifest.version !== version)
        throw new BadRequestException('Tarball package identity does not match the requested package');
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
      // Activation and its state update must commit together so a rollback cannot
      // remove another install's target or overwrite its state entry.
      return await this.mutateInstalls(async () => {
        const activation = await this.activate(source, name);
        try {
          await this.writeState(installed);
        } catch (error) {
          await this.rollbackActivation(activation);
          throw error;
        }
        try {
          await this.removeBackup(activation.backup);
        } catch (error) {
          this.logger.error(`Failed to remove backup for ${name}`, error);
        }
        new PluginService().requestRestart();
        return installed;
      });
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  listInstalled(): InstalledNpmPlugin[] {
    const statePath = join(PluginService.PLUGIN_PATH, STATE_FILE);
    if (!existsSync(statePath)) return [];
    try {
      return JSON.parse(readFileSync(statePath, 'utf8'));
    } catch {
      return [];
    }
  }

  private async searchRegistries(): Promise<Registry[]> {
    const registries = await this.storedRegistries();
    return Promise.all([this.registry(), ...registries.map((registry) => this.registry(registry.id))]);
  }

  private marketplacePlugin(value: unknown, registry: Registry): MarketplacePlugin {
    const fallback = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const name = typeof fallback.name === 'string' ? fallback.name : 'Unknown package';
    const version = typeof fallback.version === 'string' ? fallback.version : null;
    const classified = this.classification.classify(name, registry.url);
    try {
      const { pkg } = parseNpmPluginPackage(value, this.hostVersion());
      return {
        name: pkg.name,
        version: pkg.version,
        displayName: pkg.attraccess.displayName,
        description: pkg.attraccess.description ?? null,
        permissions: pkg.attraccess.permissions,
        hostRange: pkg.attraccess.host,
        repository: repositoryUrl(pkg.repository),
        homepage: pkg.homepage ?? null,
        license: pkg.license ?? null,
        publisher: publisherName(pkg.author),
        deprecated: Boolean((pkg as { deprecated?: unknown }).deprecated),
        registry: { id: registry.id, name: registry.name, url: registry.url },
        classification: classified.kind,
        classificationReason: classified.reason,
        installable: true,
        incompatibilityReason: null,
        integrity: distIntegrity(pkg),
      };
    } catch (error) {
      return {
        name,
        version,
        displayName: null,
        description: null,
        permissions: [],
        hostRange: null,
        repository: null,
        homepage: null,
        license: null,
        publisher: null,
        deprecated: Boolean(fallback.deprecated),
        registry: { id: registry.id, name: registry.name, url: registry.url },
        classification: classified.kind,
        classificationReason: classified.reason,
        installable: false,
        incompatibilityReason: error instanceof Error ? error.message : 'Package metadata is invalid',
        integrity: null,
      };
    }
  }

  private async activate(source: string, name: string): Promise<{ target: string; backup: string }> {
    const target = join(PluginService.PLUGIN_PATH, pluginDirectory(name));
    const backupDirectory = join(PluginService.PLUGIN_PATH, BACKUP_DIRECTORY);
    const backup = join(backupDirectory, randomUUID());
    await mkdir(backupDirectory, { recursive: true });
    if (existsSync(target)) await rename(target, backup);
    try {
      await rename(source, target);
      return { target, backup };
    } catch (error) {
      if (existsSync(backup) && !existsSync(target)) await rename(backup, target);
      throw error;
    }
  }

  private async rollbackActivation({ target, backup }: { target: string; backup: string }): Promise<void> {
    await rm(target, { recursive: true, force: true });
    if (existsSync(backup)) await rename(backup, target);
  }

  private removeBackup(backup: string): Promise<void> {
    return rm(backup, { recursive: true, force: true });
  }

  private async writeState(installed: InstalledNpmPlugin): Promise<void> {
    const records = this.listInstalled().filter(({ name }) => name !== installed.name);
    const statePath = join(PluginService.PLUGIN_PATH, STATE_FILE);
    const temporaryPath = `${statePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify([...records, installed]));
      await rename(temporaryPath, statePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
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
    try {
      return zodRegistries(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  private async mutateRegistries(operation: (registries: StoredRegistry[]) => Promise<void>): Promise<void> {
    const mutation = this.registryMutation.then(async () => operation(await this.storedRegistries()));
    this.registryMutation = mutation.then(
      () => undefined,
      () => undefined,
    );
    return mutation;
  }

  private async mutateInstalls<T>(operation: () => Promise<T>): Promise<T> {
    const mutation = this.installMutation.then(operation);
    this.installMutation = mutation.then(
      () => undefined,
      () => undefined,
    );
    return mutation;
  }

  private async getJson(url: string, registry: Registry): Promise<unknown> {
    const target = new URL(url);
    const addresses = await validateRegistryDestination(target, registry);
    const response = await axios.get(target.toString(), {
      headers: registry.token ? { authorization: `Bearer ${registry.token}` } : undefined,
      timeout: 10_000,
      maxContentLength: MAX_METADATA_BYTES,
      maxRedirects: 0,
      lookup: (hostname, _options, callback) => {
        if (hostname !== target.hostname) return callback(new Error('Unexpected registry host'), '', 4);
        callback(null, addresses[0].address, addresses[0].family);
      },
    });
    return response.data;
  }

  private async download(url: string, registry: Registry): Promise<Buffer> {
    let target = new URL(url);
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      const addresses = await validateRegistryDestination(target, registry);
      const response = await axios.get<ArrayBuffer>(target.toString(), {
        responseType: 'arraybuffer',
        timeout: 30_000,
        maxContentLength: MAX_ARCHIVE_BYTES,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
        headers: registry.token ? { authorization: `Bearer ${registry.token}` } : undefined,
        lookup: (hostname, _options, callback) => {
          if (hostname !== target.hostname) return callback(new Error('Unexpected tarball host'), '', 4);
          callback(null, addresses[0].address, addresses[0].family);
        },
      });
      if (response.status < 300) return Buffer.from(response.data);
      const location = response.headers.location;
      if (!location) throw new BadRequestException('Tarball redirect has no destination');
      target = new URL(location, target);
    }
    throw new BadRequestException('Tarball exceeded the redirect limit');
  }

  private hostVersion(): string {
    return resolveAppVersion();
  }
}

function normalizeRegistryUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('Registry URL must use HTTP(S)');
  return url.toString().replace(/\/$/, '');
}
function pluginDirectory(name: string): string {
  return `npm-${Buffer.from(name).toString('base64url')}`;
}
function zodRegistries(value: unknown): StoredRegistry[] {
  if (!Array.isArray(value)) throw new Error();
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error();
    const item = entry as StoredRegistry;
    return { id: item.id, name: item.name, url: normalizeRegistryUrl(item.url) };
  });
}
function validateEntries(
  root: string,
  manifest: {
    main: {
      backend?: { directory: string; entryPoint: string };
      frontend?: { directory: string; entryPoint: string; styles?: string };
      migrations?: { directory: string; entryPoint: string };
    };
  },
): void {
  for (const entry of [manifest.main.backend, manifest.main.frontend, manifest.main.migrations]) {
    if (entry && !existsSync(join(root, entry.directory, entry.entryPoint)))
      throw new BadRequestException('Package declares an entry point that is not present');
  }
  if (
    manifest.main.frontend?.styles &&
    !existsSync(join(root, manifest.main.frontend.directory, manifest.main.frontend.styles))
  )
    throw new BadRequestException('Package declares styles that are not present');
}
function verifyIntegrity(buffer: Buffer, dist: PackageVersion['dist']): void {
  if (dist.integrity) {
    const match = /^(sha(?:256|384|512))-(.+)$/.exec(dist.integrity);
    if (!match || createHash(match[1]).update(buffer).digest('base64') !== match[2])
      throw new BadRequestException('Tarball integrity check failed');
    return;
  }
  if (createHash('sha1').update(buffer).digest('hex') !== dist.shasum)
    throw new BadRequestException('Tarball integrity check failed');
}

async function extractTarball(tarball: Buffer, destination: string): Promise<void> {
  let extractedBytes = 0;
  let entries = 0;
  await pipeline(
    Readable.from(tarball),
    tar.x({
      cwd: destination,
      gzip: true,
      strict: true,
      preservePaths: false,
      filter: (path, entry) => {
        if (
          !path.startsWith('package/') ||
          !safeArchivePath(path) ||
          !('type' in entry) ||
          !['File', 'Directory'].includes(entry.type)
        )
          throw new BadRequestException('Tarball contains an unsafe entry');
        entries += 1;
        extractedBytes += entry.size;
        if (entries > MAX_ARCHIVE_ENTRIES || extractedBytes > MAX_EXTRACTED_BYTES)
          throw new BadRequestException('Tarball exceeds extraction limits');
        return true;
      },
    }),
  );
}

async function validateRegistryDestination(
  url: URL,
  registry: Registry,
): Promise<Array<{ address: string; family: 4 | 6 }>> {
  if (
    url.protocol !== new URL(registry.url).protocol ||
    url.host !== new URL(registry.url).host ||
    url.username ||
    url.password
  )
    throw new BadRequestException('Tarball URL must use the configured registry origin');
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => ipaddr.parse(address).range() !== 'unicast'))
    throw new BadRequestException('Tarball URL must resolve only to public addresses');
  return addresses.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
}

function safeArchivePath(value: string): boolean {
  return !value.startsWith('/') && !value.split('/').includes('..');
}

function repositoryUrl(value: string | { url: string } | undefined): string | null {
  return typeof value === 'string' ? value : value?.url ?? null;
}

function publisherName(value: string | { name?: string } | undefined): string | null {
  return typeof value === 'string' ? value : value?.name ?? null;
}

function distIntegrity(pkg: NpmPluginPackage): string | null {
  const dist = (pkg as NpmPluginPackage & { dist?: { integrity?: unknown; shasum?: unknown } }).dist;
  if (typeof dist?.integrity === 'string') return dist.integrity;
  return typeof dist?.shasum === 'string' ? `sha1-${dist.shasum}` : null;
}
