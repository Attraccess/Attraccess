import { BadRequestException, NotFoundException } from '@nestjs/common';
import { parseNpmPluginPackage } from './npm-plugin-contract';
import { NpmPluginRegistriesImplementation } from './npm-plugin-registries';
import {
  MarketplacePlugin,
  Registry,
  distIntegrity,
  packageName,
  packageProvenance,
  registryPublisher,
  repositoryUrl,
} from './npm-plugin.service.feature-definitions';
export abstract class NpmPluginMarketplaceImplementation extends NpmPluginRegistriesImplementation {
  async packageMetadata(name: string, registryId?: string): Promise<unknown> {
    const registry = await this.registry(registryId);
    return this.getJson(`${registry.url}/${encodeURIComponent(name)}`, registry);
  }

  async packageVersions(name: string, registryId?: string): Promise<string[]> {
    const metadata = (await this.packageMetadata(name, registryId)) as { versions?: Record<string, unknown> };
    return Object.keys(metadata.versions ?? {}).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  }

  async searchMarketplace(
    query: string,
    registryId?: string,
  ): Promise<{ results: MarketplacePlugin[]; errors: string[] }> {
    const registries = registryId ? [await this.registry(registryId)] : await this.searchRegistries();
    const responses = await Promise.all(
      registries.map(async (registry) => {
        try {
          const search = (await this.getJson(
            `${registry.url}/-/v1/search?text=${encodeURIComponent(`keywords:attraccess-plugin ${query.trim()}`)}&size=20`,
            registry,
          )) as { objects?: Array<{ package?: unknown }> };
          return {
            results: (
              await Promise.allSettled(
                (search.objects ?? []).map(async ({ package: pkg }) => {
                  const summary = pkg as { name?: unknown };
                  return typeof summary?.name === 'string'
                    ? this.marketplacePackage(summary.name, registry.id)
                    : this.marketplacePlugin(pkg, registry);
                }),
              )
            ).flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
            error: null,
          };
        } catch {
          return { results: [], error: `Could not search ${registry.name}` };
        }
      }),
    );
    // No hardcoded package list: official plugins are discovered through the same
    // keyword search as community plugins and classified by publisher and scope.
    const results = new Map(
      responses.flatMap(({ results }) => results).map((plugin) => [`${plugin.registry.id}:${plugin.name}`, plugin]),
    );
    return {
      results: [...results.values()],
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
    if (metadata.name && metadata.name !== name)
      throw new BadRequestException('Registry metadata identity does not match the requested package');
    const version = metadata['dist-tags']?.latest;
    const pkg = version ? metadata.versions?.[version] : undefined;
    if (!pkg) throw new NotFoundException('Package has no latest version');
    if (packageName(pkg) !== name)
      throw new BadRequestException('Registry metadata identity does not match the requested package');
    return this.marketplacePlugin(pkg, registry, registryPublisher(pkg) ?? registryPublisher(metadata), name);
  }

  protected async searchRegistries(): Promise<Registry[]> {
    const registries = await this.storedRegistries();
    return Promise.all([this.registry(), ...registries.map((registry) => this.registry(registry.id))]);
  }

  protected marketplacePlugin(
    value: unknown,
    registry: Registry,
    publisher = registryPublisher(value),
    resolvedName?: string,
  ): MarketplacePlugin {
    const fallback = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const name = resolvedName ?? packageName(fallback) ?? 'Unknown package';
    const version = typeof fallback.version === 'string' ? fallback.version : null;
    const classified = this.classification.classify(name, registry.url, publisher);
    try {
      const { pkg } = parseNpmPluginPackage(value, this.hostVersion());
      return {
        name: pkg.name,
        version: pkg.version,
        displayName: pkg.attraccess.displayName,
        description: pkg.attraccess.description ?? null,
        dependencies: pkg.attraccess.dependencies,
        permissions: pkg.attraccess.permissions,
        hostRange: pkg.attraccess.host,
        sdkCompatibility: {
          backend: pkg.attraccess.sdk.backend ?? null,
          frontend: pkg.attraccess.sdk.frontend ?? null,
        },
        repository: repositoryUrl(pkg.repository),
        homepage: pkg.homepage ?? null,
        license: pkg.license ?? null,
        publisher,
        deprecated: Boolean((pkg as { deprecated?: unknown }).deprecated),
        registry: { id: registry.id, name: registry.name, url: registry.url },
        classification: classified.kind,
        classificationReason: classified.reason,
        installable: true,
        incompatibilityReason: null,
        integrity: distIntegrity(pkg),
        provenance: packageProvenance(pkg),
      };
    } catch (error) {
      return {
        name,
        version,
        displayName: null,
        description: null,
        dependencies: [],
        permissions: [],
        hostRange: null,
        sdkCompatibility: { backend: null, frontend: null },
        repository: null,
        homepage: null,
        license: null,
        publisher,
        deprecated: Boolean(fallback.deprecated),
        registry: { id: registry.id, name: registry.name, url: registry.url },
        classification: classified.kind,
        classificationReason: classified.reason,
        installable: false,
        incompatibilityReason: error instanceof Error ? error.message : 'Package metadata is invalid',
        integrity: null,
        provenance: null,
      };
    }
  }
}
