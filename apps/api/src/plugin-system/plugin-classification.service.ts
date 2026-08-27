import { Injectable } from '@nestjs/common';

export type PluginClassification = {
  kind: 'official' | 'community';
  reason: string;
};

const OFFICIAL_PACKAGES = [
  {
    name: '@attraccess-plugins/shelly',
    registryUrl: 'https://registry.npmjs.org',
  },
  {
    name: '@attraccess-plugins/rabbitmq',
    registryUrl: 'https://registry.npmjs.org',
  },
] as const;

@Injectable()
export class PluginClassificationService {
  classify(name: string, registryUrl: string): PluginClassification {
    if (OFFICIAL_PACKAGES.some((plugin) => plugin.name === name && plugin.registryUrl === registryUrl)) {
      return { kind: 'official', reason: 'Approved Attraccess package source' };
    }
    return { kind: 'community', reason: 'Not listed as an approved Attraccess package source' };
  }

  officialPackages(): ReadonlyArray<{ name: string; registryUrl: string }> {
    return OFFICIAL_PACKAGES;
  }
}
