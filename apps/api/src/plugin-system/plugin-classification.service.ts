import { Injectable } from '@nestjs/common';

export type PluginClassification = {
  kind: 'official' | 'community';
  reason: string;
};

const NPM_REGISTRY_URL = 'https://registry.npmjs.org';
const OFFICIAL_PLUGIN_PREFIX = '@attraccess/plugin-';

/**
 * Classification is purely rule-based: a package is official when it is served by
 * the public npm registry under the official scope. npm only lets members of the
 * `attraccess` organization publish to `@attraccess/*`, so the scope is the trust
 * anchor; the per-version publisher is a person or "GitHub Actions" (trusted
 * publishing), never the organization itself, and is deliberately not checked.
 * The host keeps no per-plugin list; discovery happens through registry search
 * (keyword `attraccess-plugin`), which every official package carries.
 */
@Injectable()
export class PluginClassificationService {
  classify(name: string, registryUrl: string): PluginClassification {
    if (registryUrl === NPM_REGISTRY_URL && name.startsWith(OFFICIAL_PLUGIN_PREFIX)) {
      return { kind: 'official', reason: 'Published by Attraccess on npm' };
    }

    return { kind: 'community', reason: 'Not published by Attraccess on npm' };
  }
}
