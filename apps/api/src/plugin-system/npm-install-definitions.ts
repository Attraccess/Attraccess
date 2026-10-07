import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PendingNpmPluginAudit } from './npm-plugin-audit-state';
import { PluginDependency } from './plugin-dependencies';
import { PluginService } from './plugin.service';
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
