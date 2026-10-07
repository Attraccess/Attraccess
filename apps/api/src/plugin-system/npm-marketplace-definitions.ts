import { PendingNpmPluginAudit } from './npm-plugin-audit-state';
import { NpmPluginPackage } from './npm-plugin-contract';
import { StoredRegistry } from './npm-registry-definitions';
import { PluginDependency } from './plugin-dependencies';

/** Per-operation observations; contains no registry tokens, errors or plugin configuration. */
export type NpmPluginAuditState = {
  context?: Omit<PendingNpmPluginAudit, 'details' | 'migrationOutcome'>;
  packageName: string;
  requestedSpec: string;
  oldVersion?: string;
  newVersion?: string;
  registryId?: string;
  registryUrl?: string;
  integrity?: string;
  classification?: 'official' | 'community';
  permissionAdditions?: string;
  permissionRemovals?: string;
  integrityResult: 'not-checked' | 'verified';
  provenanceResult: 'not-verified';
  migrationOutcome: 'not-run' | 'pending-restart' | 'not-applicable';
  activationOutcome: 'not-attempted' | 'failed' | 'quarantined' | 'restart-requested' | 'removed';
  restartRequested: number;
  rollbackOutcome: 'not-needed' | 'succeeded' | 'failed' | 'unknown';
};

export type InstalledNpmPluginVersion = {
  dependencies?: PluginDependency[];
  version: string;
  publishedAt: string | null;
  direction: 'current' | 'newer' | 'older';
  compatible: boolean;
  reason: string | null;
  permissions: string[];
  permissionAdditions: string[];
  permissionRemovals: string[];
  classification: 'official' | 'community';
  classificationReason: string;
  deprecated: string | null;
  integrity: string | null;
  repository: string | null;
  homepage: string | null;
  semverImpact: 'major' | 'minor' | 'patch' | 'prerelease' | 'none';
  matchesRequestedSpec: boolean;
};

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
  registry: StoredRegistry;
  classification: 'official' | 'community';
  classificationReason: string;
  installable: boolean;
  incompatibilityReason: string | null;
  integrity: string | null;
  provenance: string | null;
};
export function repositoryUrl(value: string | { url: string } | undefined): string | null {
  return typeof value === 'string' ? value : (value?.url ?? null);
}
export function registryPublisher(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const metadata = value as { publisher?: unknown; _npmUser?: unknown; maintainers?: unknown };
  const publisher = publisherName(metadata.publisher) ?? publisherName(metadata._npmUser);
  if (publisher) return publisher;
  if (!Array.isArray(metadata.maintainers)) return null;
  return metadata.maintainers.map(publisherName).find((name): name is string => name !== null) ?? null;
}
export function publisherName(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  const { name, username } = value as { name?: unknown; username?: unknown };
  return typeof username === 'string' ? username : typeof name === 'string' ? name : null;
}
export function distIntegrity(value: { integrity?: unknown; shasum?: unknown } | NpmPluginPackage): string | null {
  const dist = ('dist' in value ? value.dist : value) as { integrity?: unknown; shasum?: unknown };
  if (typeof dist?.integrity === 'string') return dist.integrity;
  return typeof dist?.shasum === 'string' ? `sha1-${Buffer.from(dist.shasum, 'hex').toString('base64')}` : null;
}
export function packageProvenance(pkg: NpmPluginPackage): string | null {
  const attestations = (pkg as NpmPluginPackage & { dist?: { attestations?: { url?: unknown } } }).dist?.attestations;
  return typeof attestations?.url === 'string' ? attestations.url : null;
}
export function packageName(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const { name } = value as { name?: unknown };
  return typeof name === 'string' ? name : null;
}
