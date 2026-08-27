import { Injectable } from '@nestjs/common';

export type PluginClassification = {
  kind: 'official' | 'community';
  reason: string;
};

export type OfficialPluginPackage = {
  name: string;
  registryUrl: string;
  publisher: string;
  repositoryUrl?: string;
};

const OFFICIAL_PACKAGES = [
  {
    name: '@attraccess-plugins/shelly',
    registryUrl: 'https://registry.npmjs.org',
    publisher: 'attraccess',
  },
  {
    name: '@attraccess-plugins/rabbitmq',
    registryUrl: 'https://registry.npmjs.org',
    publisher: 'attraccess',
  },
] as const satisfies ReadonlyArray<OfficialPluginPackage>;

@Injectable()
export class PluginClassificationService {
  classify(name: string, registryUrl: string, publisher?: string | null): PluginClassification {
    const approved = OFFICIAL_PACKAGES.find((plugin) => plugin.name === name && plugin.registryUrl === registryUrl);
    if (!approved) {
      return { kind: 'community', reason: 'Not listed as an approved Attraccess package source' };
    }
    if (publisher && publisher.toLowerCase() !== approved.publisher) {
      return { kind: 'community', reason: 'Registry publisher does not match the approved package source' };
    }
    if (approved) {
      return { kind: 'official', reason: 'Approved Attraccess package source' };
    }
  }

  officialPackages(): ReadonlyArray<OfficialPluginPackage> {
    return OFFICIAL_PACKAGES;
  }
}
