import { Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { SettingsStoreService } from '../settings/settings-store.service';
import { PendingNpmPluginAudit } from './npm-plugin-audit-state';
import { NpmPluginPackage } from './npm-plugin-contract';
import {
  InstalledNpmPlugin,
  InstalledNpmPluginVersion,
  MarketplacePlugin,
  NpmPluginAuditState,
  PackageVersion,
  PluginFileMove,
  PluginInstallPlan,
  PluginUpdatePolicy,
  PreparedPlugin,
  Registry,
  StoredRegistry,
  readInstalledNpmPlugins,
} from './npm-plugin.service.feature-definitions';
import { PluginClassificationService } from './plugin-classification.service';

export abstract class NpmPluginServiceRouteContext {
  declare public static recoverBackups: () => Promise<void>;
  protected abstract readonly audit?: AuditService;
  protected abstract readonly settings: SettingsStoreService;
  protected abstract mutateInstalls<T>(operation: () => Promise<T>): Promise<T>;
  protected abstract writeState(
    installed: InstalledNpmPlugin,
    pendingAudit?: PendingNpmPluginAudit | null,
  ): Promise<void>;
  protected static readonly recoveryLogger = new Logger('NpmPluginService');
  protected abstract storedRegistries(): Promise<StoredRegistry[]>;
  protected abstract mutateRegistries(operation: (registries: StoredRegistry[]) => Promise<void>): Promise<void>;
  protected abstract registry(id?: string): Promise<Registry>;
  protected abstract getJson(url: string, registry: Registry): Promise<unknown>;
  public abstract packageMetadata(name: string, registryId?: string): Promise<unknown>;
  protected abstract searchRegistries(): Promise<Registry[]>;
  public abstract marketplacePackage(name: string, registryId?: string): Promise<MarketplacePlugin>;
  protected abstract marketplacePlugin(
    value: unknown,
    registry: Registry,
    publisher?: string | null,
    resolvedName?: string,
  ): MarketplacePlugin;
  public abstract listInstalled(): InstalledNpmPlugin[];
  protected abstract resolveVersion(
    name: string,
    spec: string,
    registry: Registry,
  ): Promise<{
    version: string;
    metadata: { versions?: Record<string, PackageVersion>; 'dist-tags'?: Record<string, string> };
  }>;
  public abstract installPlan(name: string, spec: string, registryId?: string): Promise<PluginInstallPlan>;
  protected abstract installGraph(
    plan: PluginInstallPlan,
    registry: Registry,
    requestedSpec: string,
    replacing?: InstalledNpmPlugin,
    approvedPermissions?: string[],
    audit?: NpmPluginAuditState,
    planToken?: string,
  ): Promise<InstalledNpmPlugin>;
  protected abstract installFromRegistry(
    name: string,
    version: string,
    registry: Registry,
    replacing?: InstalledNpmPlugin,
    approvedPermissionAdditions?: string[],
    requestedSpec?: string,
    resolvedMetadata?: {
      versions?: Record<string, PackageVersion>;
      publisher?: unknown;
      _npmUser?: unknown;
      maintainers?: unknown;
    },
    audit?: NpmPluginAuditState,
  ): Promise<InstalledNpmPlugin>;
  protected abstract installed(name: string): InstalledNpmPlugin;
  public abstract removalPlan(name: string): InstalledNpmPlugin[];
  protected abstract writeTransaction(
    records: ReturnType<typeof readInstalledNpmPlugins>,
    moves: PluginFileMove[],
  ): Promise<void>;
  protected abstract writeStateWithout(name: string): Promise<void>;
  protected abstract writeRecords(records: ReturnType<typeof readInstalledNpmPlugins>): Promise<void>;
  protected abstract readonly logger: Logger;
  protected abstract removeBackup(backup: string): Promise<void>;
  protected abstract prepareInstallFromRegistry(
    name: string,
    version: string,
    registry: Registry,
    replacing?: InstalledNpmPlugin,
    approvedPermissionAdditions?: string[],
    requestedSpec?: string,
    resolvedMetadata?: {
      versions?: Record<string, PackageVersion>;
      publisher?: unknown;
      _npmUser?: unknown;
      maintainers?: unknown;
    },
    audit?: NpmPluginAuditState,
  ): Promise<PreparedPlugin>;
  protected abstract pendingAudit(state?: NpmPluginAuditState): PendingNpmPluginAudit | undefined;
  protected abstract activate(
    source: string,
    name: string,
    audit?: NpmPluginAuditState,
    backupName?: string,
  ): Promise<{ target: string; backup: string }>;
  protected abstract rollbackForAudit(
    activation: { target: string; backup: string },
    audit?: NpmPluginAuditState,
  ): Promise<void>;
  protected abstract hostVersion(): string;
  protected abstract versionCandidate(
    installed: InstalledNpmPlugin,
    version: string,
    publishedAt: string | null,
    permissions: string[],
    publisher: string | null,
    pkg: NpmPluginPackage | null,
  ): InstalledNpmPluginVersion;
  public abstract installedVersionCandidates(name: string): Promise<InstalledNpmPluginVersion[]>;
  public abstract getUpdatePolicy(): Promise<PluginUpdatePolicy>;
  public abstract checkInstalled(name: string): Promise<InstalledNpmPlugin>;
  protected abstract readonly classification: PluginClassificationService;
  protected abstract download(url: string, registry: Registry): Promise<Buffer>;
  protected abstract isolateActivation(target: string): Promise<void>;
  protected abstract rollbackActivation({ target, backup }: { target: string; backup: string }): Promise<void>;
  protected abstract registryMutation: Promise<void>;
  protected abstract installMutation: Promise<void>;
}
