import { BadRequestException, NotFoundException } from '@nestjs/common';

import axios from 'axios';

import { randomUUID } from 'crypto';

import {
  MAX_ARCHIVE_BYTES,
  MAX_CONFIGURED_REGISTRIES,
  MAX_METADATA_BYTES,
  REGISTRIES_KEY,
  REGISTRY_PARENT,
  Registry,
  StoredRegistry,
  normalizeRegistryUrl,
  validateRegistryDestination,
  zodRegistries,
} from './package-models';
import { SettingsStoreService } from '../../settings/settings-store.service';

/** The configured npm registries and the requests to them. */
export class NpmRegistryAccess {
  private registryMutation = Promise.resolve();

  constructor(private readonly settings: SettingsStoreService) {}

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
      if (registries.length >= MAX_CONFIGURED_REGISTRIES)
        throw new BadRequestException(`A maximum of ${MAX_CONFIGURED_REGISTRIES} registries can be configured`);
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

  async registry(id?: string): Promise<Registry> {
    if (!id || id === 'npm') return { id: 'npm', name: 'npm', url: 'https://registry.npmjs.org', token: null };
    const stored = (await this.storedRegistries()).find((registry) => registry.id === id);
    if (!stored) throw new NotFoundException('Registry not found');
    const { value: token } = await this.settings.getSecretSetting(REGISTRY_PARENT, `${id}:token`);
    return { ...stored, token };
  }

  async storedRegistries(): Promise<StoredRegistry[]> {
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

  async getJson(url: string, registry: Registry): Promise<unknown> {
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

  async download(url: string, registry: Registry): Promise<Buffer> {
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
}
