import { resolveAppVersion } from '../config/app.config';
import { NpmPluginUpdatePolicyImplementation } from './npm-plugin-update-policy';
import {
  InstalledNpmPlugin,
  PluginUpdatePolicy,
  eligibleForPolicy,
  isDistTag,
  sameUpdatePolicy,
} from './npm-plugin.service.feature-definitions';
export abstract class NpmPluginUpdateCheckImplementation extends NpmPluginUpdatePolicyImplementation {
  async checkInstalled(name: string): Promise<InstalledNpmPlugin> {
    const installed = this.installed(name);
    let policy: PluginUpdatePolicy | undefined;
    const snapshotChanged = (current: InstalledNpmPlugin, currentPolicy?: PluginUpdatePolicy) =>
      current.version !== installed.version ||
      current.requestedSpec !== installed.requestedSpec ||
      current.registryId !== installed.registryId ||
      (policy !== undefined && currentPolicy !== undefined && !sameUpdatePolicy(currentPolicy, policy));
    try {
      policy = await this.getUpdatePolicy();
      if (!policy.checksEnabled) return installed;
      const candidates = await this.installedVersionCandidates(name);
      const requested = isDistTag(installed.requestedSpec)
        ? await this.resolveVersion(name, installed.requestedSpec, await this.registry(installed.registryId))
        : undefined;
      const updated = await this.mutateInstalls(async () => {
        const current = this.installed(name);
        // Candidates and dist-tag resolutions belong to the snapshot used for the registry request.
        if (snapshotChanged(current, await this.getUpdatePolicy())) return null;
        const candidate = candidates.find(
          (item) =>
            item.direction === 'newer' &&
            item.compatible &&
            eligibleForPolicy(item, current, policy, requested?.version),
        );
        const blocked = candidates.some((item) => item.direction === 'newer' && item.compatible) && !candidate;
        const updated = {
          ...current,
          updateCheck: {
            checkedAt: new Date().toISOString(),
            candidate: candidate?.version ?? null,
            state: candidate ? ('available' as const) : blocked ? ('blocked' as const) : ('up-to-date' as const),
            error: null,
          },
        };
        await this.writeState(updated);
        return updated;
      });
      return updated ?? this.checkInstalled(name);
    } catch (error) {
      const updateCheck = {
        checkedAt: new Date().toISOString(),
        candidate: null,
        state: 'failed' as const,
        error: error instanceof Error ? error.message : 'Update check failed',
      };
      const failed = await this.mutateInstalls(async () => {
        const current = this.installed(name);
        if (snapshotChanged(current, policy === undefined ? undefined : await this.getUpdatePolicy())) return null;
        const updated = {
          ...current,
          updateCheck,
        };
        await this.writeState(updated);
        return updated;
      });
      return failed ?? this.checkInstalled(name);
    }
  }

  async checkAllInstalled(): Promise<InstalledNpmPlugin[]> {
    const checked: InstalledNpmPlugin[] = [];
    const installs = this.listInstalled();
    for (let offset = 0; offset < installs.length; offset += 4) {
      const results = await Promise.allSettled(
        installs.slice(offset, offset + 4).map(({ name }) => this.checkInstalled(name)),
      );
      checked.push(...results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])));
    }
    return checked;
  }

  protected hostVersion(): string {
    return resolveAppVersion();
  }
}
