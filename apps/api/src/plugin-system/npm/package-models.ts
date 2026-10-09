import { BadRequestException } from '@nestjs/common';
import * as semver from 'semver';
import { randomUUID, createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PendingNpmPluginAudit } from './audit-state';
import { PluginDependency } from '../runtime/dependencies';
import { PluginService } from '../plugin.service';
import { NpmPluginPackage } from './contract-validation';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import * as tar from 'tar';
import { lookup } from 'dns/promises';
import ipaddr from 'ipaddr.js';

export const STATE_FILE = '.npm-plugin-state.json';

export const TRANSACTION_FILE = '.npm-plugin-transaction.json';

export type PluginFileMove = { installPath: string; backupName: string; hadTarget: boolean; quarantineError?: string };

export type PluginTransaction = { after: string; moves: PluginFileMove[] };

export const BACKUP_DIRECTORY = '.npm-backups';

export type InstalledNpmPlugin = {
  dependencies?: PluginDependency[];
  name: string;
  version: string;
  requestedSpec: string;
  registryId: string;
  registryUrl: string;
  integrity: string;
  installPath: string;
  permissions: string[];
  compatibility: {
    host: string;
    sdk: { backend?: string; frontend?: string };
  };
  state: 'active' | 'quarantined';
  installedAt: string;
  activatedAt: string;
  lastError: string | null;
  classification: 'official' | 'community';
  classificationReason: string;
  publisher: string | null;
  updateOverride?: 'inherit' | 'off' | 'patch' | 'minor' | 'follow';
  updateCheck?: {
    checkedAt: string;
    candidate: string | null;
    state: 'up-to-date' | 'available' | 'blocked' | 'failed';
    error: string | null;
  };
  knownGoodVersion?: string | null;
};

export type PluginInstallPlan = {
  root: string;
  stateHash: string;
  token: string;
  plugins: Array<{
    name: string;
    version: string;
    displayName: string;
    action: 'install' | 'reuse' | 'replace';
    permissions: string[];
    dependencies: PluginDependency[];
    integrity: string | null;
    classification: 'official' | 'community';
    registryUrl?: string;
  }>;
};

export type ResolvedPlugin = PluginInstallPlan['plugins'][number];

export type PreparedPlugin = { installed: InstalledNpmPlugin; source: string; staging: string };

export function pluginDirectory(name: string): string {
  return `npm-${Buffer.from(name).toString('base64url')}`;
}

export function backupDirectoryName(installPath: string): string {
  return `${installPath}-${randomUUID()}`;
}

export function backupInstallPath(backupName: string): string | undefined {
  const match = /^(npm-[A-Za-z0-9_-]+)-[0-9a-f-]{36}$/.exec(backupName);
  return match?.[1];
}

export function packageVersion(directory: string): string | undefined {
  try {
    const pkg = JSON.parse(readFileSync(join(directory, 'plugin.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

export function readInstalledNpmPlugins(): Array<InstalledNpmPlugin & { pendingAudit?: PendingNpmPluginAudit }> {
  const statePath = join(PluginService.PLUGIN_PATH, STATE_FILE);
  if (!existsSync(statePath)) return [];
  try {
    const records = JSON.parse(readFileSync(statePath, 'utf8'));
    if (!Array.isArray(records)) return [];
    return records.map((record) => ({
      ...record,
      dependencies: record.dependencies ?? [],
      requestedSpec: record.requestedSpec ?? record.version,
      compatibility: record.compatibility ?? { host: 'unknown', sdk: {} },
      state: record.state ?? 'active',
      installedAt: record.installedAt ?? new Date(0).toISOString(),
      activatedAt: record.activatedAt ?? new Date(0).toISOString(),
      lastError: record.lastError ?? null,
      updateOverride: record.updateOverride ?? 'inherit',
      updateCheck: record.updateCheck ?? null,
      knownGoodVersion: record.knownGoodVersion ?? null,
    }));
  } catch {
    return [];
  }
}

export const REGISTRY_PARENT = 'plugin-registry';

export const REGISTRIES_KEY = 'registries';

export const MAX_METADATA_BYTES = 10 * 1024 * 1024;

export const MAX_CONFIGURED_REGISTRIES = 5;

export type StoredRegistry = { id: string; name: string; url: string };

export type Registry = StoredRegistry & { token: string | null };

export type PackageVersion = { version: string; dist: { tarball: string; integrity?: string; shasum?: string } };

export function normalizeRegistryUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('Registry URL must use HTTP(S)');
  return url.toString().replace(/\/$/, '');
}

export function zodRegistries(value: unknown): StoredRegistry[] {
  if (!Array.isArray(value)) throw new Error();
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error();
    const item = entry as StoredRegistry;
    return { id: item.id, name: item.name, url: normalizeRegistryUrl(item.url) };
  });
}

export async function validateRegistryDestination(
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

export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;

export const MAX_EXTRACTED_BYTES = 200 * 1024 * 1024;

export const MAX_ARCHIVE_ENTRIES = 10_000;

export function validateEntries(
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

export function verifyIntegrity(buffer: Buffer, dist: PackageVersion['dist']): void {
  if (dist.integrity) {
    const match = /^(sha(?:256|384|512))-(.+)$/.exec(dist.integrity);
    if (!match || createHash(match[1]).update(buffer).digest('base64') !== match[2])
      throw new BadRequestException('Tarball integrity check failed');
    return;
  }
  if (createHash('sha1').update(buffer).digest('hex') !== dist.shasum)
    throw new BadRequestException('Tarball integrity check failed');
}

export async function extractTarball(tarball: Buffer, destination: string): Promise<void> {
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

export function safeArchivePath(value: string): boolean {
  return !value.startsWith('/') && !value.split('/').includes('..');
}

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

export const UPDATE_POLICY_KEY = 'update-policy';

export type PluginUpdatePolicy = {
  checksEnabled: boolean;
  mode: 'off' | 'patch' | 'minor' | 'follow';
  maintenanceWindow: { startMinute: number; durationMinutes: number };
  prerelease: boolean;
};

export const DEFAULT_PLUGIN_UPDATE_POLICY: PluginUpdatePolicy = {
  checksEnabled: true,
  mode: 'minor',
  maintenanceWindow: { startMinute: 180, durationMinutes: 120 },
  prerelease: false,
};
export function samePermissions(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((permission) => right.includes(permission));
}
export function semverImpact(current: string, target: string): InstalledNpmPluginVersion['semverImpact'] {
  if (!semver.valid(current) || !semver.valid(target) || semver.eq(current, target)) return 'none';
  const difference = semver.diff(current, target);
  if (difference === 'major' || difference === 'premajor') return 'major';
  if (difference === 'minor' || difference === 'preminor') return 'minor';
  if (semver.prerelease(target)) return 'prerelease';
  return 'patch';
}
export function matchesSpec(
  version: string,
  spec: string,
  includePrerelease = false,
  resolvedVersion?: string,
): boolean {
  return version === resolvedVersion || version === spec || semver.satisfies(version, spec, { includePrerelease });
}
export function normalizeUpdatePolicy(value: unknown): PluginUpdatePolicy {
  const candidate = value as Partial<PluginUpdatePolicy>;
  const mode = ['off', 'patch', 'minor', 'follow'].includes(candidate?.mode ?? '')
    ? (candidate.mode as PluginUpdatePolicy['mode'])
    : DEFAULT_PLUGIN_UPDATE_POLICY.mode;
  const startMinute = candidate?.maintenanceWindow?.startMinute;
  const durationMinutes = candidate?.maintenanceWindow?.durationMinutes;
  if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute >= 24 * 60)
    throw new BadRequestException('Maintenance window start must be a minute of the day');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 24 * 60)
    throw new BadRequestException('Maintenance window duration must be between 1 and 1440 minutes');
  return {
    checksEnabled:
      typeof candidate?.checksEnabled === 'boolean'
        ? candidate.checksEnabled
        : DEFAULT_PLUGIN_UPDATE_POLICY.checksEnabled,
    mode,
    prerelease:
      typeof candidate?.prerelease === 'boolean' ? candidate.prerelease : DEFAULT_PLUGIN_UPDATE_POLICY.prerelease,
    maintenanceWindow: { startMinute, durationMinutes },
  };
}
export function eligibleForPolicy(
  candidate: InstalledNpmPluginVersion,
  installed: InstalledNpmPlugin,
  policy: PluginUpdatePolicy,
  resolvedRequestedVersion?: string,
): boolean {
  const override = installed.updateOverride ?? 'inherit';
  const checksEnabled = override !== 'off' && policy.checksEnabled;
  const mode = effectiveUpdateMode(policy.mode, override);
  if (!checksEnabled || mode === 'off' || candidate.deprecated || candidate.permissionAdditions.length > 0)
    return false;
  if (!policy.prerelease && semver.prerelease(candidate.version)) return false;
  if (candidate.semverImpact === 'major') return false;
  if (mode === 'patch') return candidate.semverImpact === 'patch';
  if (mode === 'minor') return candidate.semverImpact === 'patch' || candidate.semverImpact === 'minor';
  return matchesSpec(candidate.version, installed.requestedSpec, policy.prerelease, resolvedRequestedVersion);
}
export function effectiveUpdateMode(
  globalMode: PluginUpdatePolicy['mode'],
  override: NonNullable<InstalledNpmPlugin['updateOverride']>,
): PluginUpdatePolicy['mode'] {
  if (override === 'inherit') return globalMode;
  return override;
}
export function sameUpdatePolicy(left: PluginUpdatePolicy, right: PluginUpdatePolicy): boolean {
  return (
    left.checksEnabled === right.checksEnabled &&
    left.mode === right.mode &&
    left.prerelease === right.prerelease &&
    left.maintenanceWindow.startMinute === right.maintenanceWindow.startMinute &&
    left.maintenanceWindow.durationMinutes === right.maintenanceWindow.durationMinutes
  );
}
export function isDistTag(spec: string): boolean {
  return !semver.valid(spec) && !semver.validRange(spec);
}
