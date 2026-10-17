export type InstalledNpmPlugin = {
  name: string;
  version: string;
  registryId: string;
  registryUrl: string;
  integrity: string;
  installPath: string;
  permissions: string[];
  lastError: string | null;
  classification: 'official' | 'community';
  classificationReason: string;
  requestedSpec: string;
  updateOverride: 'inherit' | 'off' | 'patch' | 'minor' | 'follow';
  updateCheck?: {
    checkedAt: string;
    candidate: string | null;
    state: 'up-to-date' | 'available' | 'blocked' | 'failed';
    error: string | null;
  } | null;
  publisher: string | null;
};

export type PluginDependency = { name: string; version: string; required: boolean };

export type MarketplacePlugin = {
  dependencies?: PluginDependency[];
  name: string;
  version: string | null;
  displayName: string | null;
  description: string | null;
  permissions: string[];
  hostRange: string | null;
  sdkCompatibility: { backend: string | null; frontend: string | null };
  repository: string | null;
  homepage: string | null;
  license: string | null;
  publisher: string | null;
  deprecated: boolean;
  registry: { id: string; name: string; url: string };
  classification: 'official' | 'community';
  classificationReason: string;
  installable: boolean;
  incompatibilityReason: string | null;
  integrity: string | null;
  provenance: string | null;
};

export type PluginInstallPlan = {
  root: string;
  token: string;
  plugins: Array<{
    name: string;
    displayName: string;
    version: string;
    action: 'install' | 'reuse' | 'replace';
    permissions: string[];
    dependencies: PluginDependency[];
    classification: 'official' | 'community';
    registryUrl?: string;
  }>;
};

export type Registry = { id: string; name: string; url: string; tokenConfigured: boolean };

export interface DeleteOptions {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

export type VersionCandidate = {
  dependencies?: PluginDependency[];
  version: string;
  publishedAt: string | null;
  direction: 'current' | 'newer' | 'older';
  compatible: boolean;
  reason: string | null;
  permissions: string[];
  permissionAdditions: string[];
  permissionRemovals: string[];
  deprecated: string | null;
  integrity: string | null;
  repository: string | null;
  homepage: string | null;
  semverImpact: 'major' | 'minor' | 'patch' | 'prerelease' | 'none';
  matchesRequestedSpec: boolean;
};

export type VersionPlugin = Pick<InstalledNpmPlugin, 'name' | 'version'>;
