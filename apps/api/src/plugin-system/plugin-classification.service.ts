import { Injectable } from '@nestjs/common';

export type PluginClassification = {
  kind: 'official' | 'community';
  reason: string;
};

export type OfficialPluginPackage = { name: string };

const NPM_REGISTRY_URL = 'https://registry.npmjs.org';
const OFFICIAL_PLUGIN_PREFIX = '@attraccess/plugin-';
const OFFICIAL_PUBLISHER = 'attraccess';
const OFFICIAL_PACKAGES = [
  { name: '@attraccess/plugin-shelly' },
  { name: '@attraccess/plugin-rabbitmq' },
  { name: '@attraccess/plugin-wago' },
] as const satisfies ReadonlyArray<OfficialPluginPackage>;

@Injectable()
export class PluginClassificationService {
  classify(name: string, registryUrl: string, publisher?: string | null): PluginClassification {
    if (
      registryUrl === NPM_REGISTRY_URL &&
      name.startsWith(OFFICIAL_PLUGIN_PREFIX) &&
      publisher?.toLowerCase() === OFFICIAL_PUBLISHER
    ) {
      return { kind: 'official', reason: 'Published by Attraccess on npm' };
    }

    return { kind: 'community', reason: 'Not published by Attraccess on npm' };
  }

  officialPackages(): ReadonlyArray<OfficialPluginPackage> {
    return OFFICIAL_PACKAGES;
  }
}
