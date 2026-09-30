import { Injectable } from '@nestjs/common';

export type PluginClassification = {
  kind: 'official' | 'community';
  reason: string;
};

const NPM_REGISTRY_URL = 'https://registry.npmjs.org';
const OFFICIAL_PLUGIN_PREFIX = '@attraccess/plugin-';
const OFFICIAL_PUBLISHER = 'attraccess';

/**
 * Classification is purely rule-based: a package is official when it is published
 * by the Attraccess account on the public npm registry under the official scope.
 * The host keeps no per-plugin list; discovery happens through registry search
 * (keyword `attraccess-plugin`), which every official package carries.
 */
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
}
