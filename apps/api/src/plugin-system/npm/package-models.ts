import type { PluginUpdatePolicy } from './update-policy';
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
  updateSettingsVersion?: number;
  /** The last version the host failed to install on its own; it is not retried for a while. */
  autoUpdateFailure?: { version: string; failedAt: string };
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
      updateOverride: storedUpdateOverride(record),
      updateCheck: record.updateCheck ?? null,
      knownGoodVersion: record.knownGoodVersion ?? null,
      updateSettingsVersion: UPDATE_SETTINGS_VERSION,
    }));
  } catch {
    return [];
  }
}

/** The stored records from before the opt-in, with the override each loses by it (null when it keeps its meaning). */
export function pluginsWithLegacyUpdateSettings(): Array<{ name: string; override: string | null }> {
  const statePath = join(PluginService.PLUGIN_PATH, STATE_FILE);
  if (!existsSync(statePath)) return [];
  try {
    const records = JSON.parse(readFileSync(statePath, 'utf8')) as InstalledNpmPlugin[];
    return records
      .filter((record) => record.updateSettingsVersion !== UPDATE_SETTINGS_VERSION)
      .map(({ name, updateOverride }) => ({
        name,
        override: updateOverride && !['inherit', 'off'].includes(updateOverride) ? updateOverride : null,
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
    };
  },
): void {
  for (const entry of [manifest.main.backend, manifest.main.frontend]) {
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
  /** The npm user who published this version, or the installed version's publisher when the registry does not say. */
  publisher: string | null;
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

export {
  DEFAULT_PLUGIN_UPDATE_POLICY,
  PluginUpdatePolicy,
  UPDATE_POLICY_KEY,
  patchUpdatePolicy,
  readStoredUpdatePolicy,
  sameUpdatePolicy,
} from './update-policy';

/** Marks records whose `updateOverride` was written since automatic updates became opt-in. */
export const UPDATE_SETTINGS_VERSION = 2;

/** An earlier override other than off could install on its own, so it falls back to the global (off) setting. */
function storedUpdateOverride(record: InstalledNpmPlugin): NonNullable<InstalledNpmPlugin['updateOverride']> {
  const override = record.updateOverride ?? 'inherit';
  return record.updateSettingsVersion === UPDATE_SETTINGS_VERSION || override === 'off' ? override : 'inherit';
}
export function samePermissions(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((permission) => right.includes(permission));
}
export function semverImpact(current: string, target: string): InstalledNpmPluginVersion['semverImpact'] {
  if (!semver.valid(current) || !semver.valid(target) || semver.eq(current, target)) return 'none';
  // Compares the version numbers, not `semver.diff`: it calls `1.0.0-nightly.1` -> `1.0.0` (the release of the same
  // line) and even `1.0.0-nightly.1` -> `1.3.0` major, so a `patch` override would let a minor update through.
  if (semver.major(current) !== semver.major(target)) return 'major';
  if (semver.minor(current) !== semver.minor(target)) return 'minor';
  if (semver.prerelease(target)) return 'prerelease';
  return 'patch';
}
/**
 * Why the host must not install `candidate` on its own although the update policy allows it, or null. Nobody reviews
 * an automatic update, so it only comes over HTTPS (or from this machine) and from the installed version's publisher.
 */
export function automaticUpdateRefusal(
  candidate: InstalledNpmPluginVersion,
  installed: InstalledNpmPlugin,
): string | null {
  const { protocol, hostname } = new URL(installed.registryUrl);
  if (protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(hostname))
    return `${installed.registryUrl} does not use HTTPS`;
  if (installed.publisher && candidate.publisher && candidate.publisher !== installed.publisher)
    return `${candidate.version} was published by ${candidate.publisher}, not ${installed.publisher}`;
  return null;
}
export function matchesSpec(
  version: string,
  spec: string,
  includePrerelease = false,
  resolvedVersion?: string,
): boolean {
  return version === resolvedVersion || version === spec || semver.satisfies(version, spec, { includePrerelease });
}
export function eligibleForPolicy(
  candidate: InstalledNpmPluginVersion,
  installed: InstalledNpmPlugin,
  policy: PluginUpdatePolicy,
  resolvedRequestedVersion?: string,
  /** On a `next` host, plugins that request `next` follow it through prereleases. */
  nextHost = false,
): boolean {
  const override = installed.updateOverride ?? 'inherit';
  const checksEnabled = override !== 'off' && policy.checksEnabled;
  const mode = effectiveUpdateMode(policy.mode, override);
  if (!checksEnabled || mode === 'off' || candidate.deprecated || candidate.permissionAdditions.length > 0)
    return false;
  // This says what may be offered. Whether the host installs it is the global switch's and the schedule's decision.
  const followsChannel =
    nextHost && installed.requestedSpec === 'next' && candidate.version === resolvedRequestedVersion;
  if (!policy.prerelease && !followsChannel && semver.prerelease(candidate.version)) return false;
  if (candidate.semverImpact === 'major') return false;
  if (followsChannel && mode === 'minor') return true;
  if (mode === 'patch') return candidate.semverImpact === 'patch';
  if (mode === 'minor') return candidate.semverImpact === 'patch' || candidate.semverImpact === 'minor';
  return matchesSpec(candidate.version, installed.requestedSpec, policy.prerelease, resolvedRequestedVersion);
}
export function effectiveUpdateMode(
  globalMode: PluginUpdatePolicy['mode'],
  override: NonNullable<InstalledNpmPlugin['updateOverride']>,
): NonNullable<InstalledNpmPlugin['updateOverride']> | PluginUpdatePolicy['mode'] {
  if (override === 'inherit') return globalMode;
  return override;
}
export function isDistTag(spec: string): boolean {
  return !semver.valid(spec) && !semver.validRange(spec);
}
