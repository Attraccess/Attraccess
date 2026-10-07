import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as semver from 'semver';
import { NpmPluginVersionCandidatesImplementation } from './npm-plugin-version-candidates';
import {
  DEFAULT_PLUGIN_UPDATE_POLICY,
  InstalledNpmPlugin,
  NpmPluginAuditState,
  PluginUpdatePolicy,
  REGISTRY_PARENT,
  UPDATE_POLICY_KEY,
  normalizeUpdatePolicy,
  samePermissions,
} from './npm-plugin.service.feature-definitions';
export abstract class NpmPluginUpdatePolicyImplementation extends NpmPluginVersionCandidatesImplementation {
  async replaceInstalled(
    name: string,
    version: string,
    approvedPermissionAdditions: string[] = [],
    approvedMajorVersion = false,
    audit?: NpmPluginAuditState,
    planToken?: string,
  ): Promise<InstalledNpmPlugin> {
    const installed = this.installed(name);
    const candidates = await this.installedVersionCandidates(name);
    const candidate = candidates.find((item) => item.version === version);
    if (!candidate) throw new NotFoundException('Package version not found');
    if (!candidate.compatible) throw new BadRequestException(candidate.reason ?? 'Package version is not compatible');
    if (semver.major(candidate.version) > semver.major(installed.version) && !approvedMajorVersion)
      throw new BadRequestException('Explicit approval is required for a major version update');
    if (!samePermissions(candidate.permissionAdditions, approvedPermissionAdditions)) {
      throw new BadRequestException(
        `Permission approval required for: ${candidate.permissionAdditions.join(', ') || 'none'}`,
      );
    }
    const registry = await this.registry(installed.registryId);
    const plan = await this.installPlan(name, version, registry.id);
    if (plan.plugins.length > 1)
      return this.installGraph(
        plan,
        registry,
        installed.requestedSpec,
        installed,
        approvedPermissionAdditions,
        audit,
        planToken,
      );
    return this.installFromRegistry(
      name,
      version,
      await this.registry(installed.registryId),
      installed,
      approvedPermissionAdditions,
      installed.requestedSpec,
      undefined,
      audit,
    );
  }

  async updateRequestedSpec(name: string, requestedSpec: string): Promise<InstalledNpmPlugin> {
    const installed = this.installed(name);
    const registry = await this.registry(installed.registryId);
    await this.resolveVersion(name, requestedSpec, registry);
    return this.mutateInstalls(async () => {
      const updated = { ...this.installed(name), requestedSpec };
      await this.writeState(updated);
      return updated;
    });
  }

  async updateOverride(
    name: string,
    updateOverride: InstalledNpmPlugin['updateOverride'],
  ): Promise<InstalledNpmPlugin> {
    if (!['inherit', 'off', 'patch', 'minor', 'follow'].includes(updateOverride ?? ''))
      throw new BadRequestException('Invalid plugin update override');
    return this.mutateInstalls(async () => {
      const updated = { ...this.installed(name), updateOverride };
      await this.writeState(updated);
      return updated;
    });
  }

  async updateVersionPolicy(
    name: string,
    requestedSpec: string,
    updateOverride: InstalledNpmPlugin['updateOverride'],
  ): Promise<InstalledNpmPlugin> {
    if (!['inherit', 'off', 'patch', 'minor', 'follow'].includes(updateOverride ?? ''))
      throw new BadRequestException('Invalid plugin update override');
    const installed = this.installed(name);
    await this.resolveVersion(name, requestedSpec, await this.registry(installed.registryId));
    return this.mutateInstalls(async () => {
      const updated = { ...this.installed(name), requestedSpec, updateOverride };
      await this.writeState(updated);
      return updated;
    });
  }

  async getUpdatePolicy(): Promise<PluginUpdatePolicy> {
    const raw = await this.settings.getPlainSetting(REGISTRY_PARENT, UPDATE_POLICY_KEY);
    if (!raw) return DEFAULT_PLUGIN_UPDATE_POLICY;
    try {
      return normalizeUpdatePolicy(JSON.parse(raw));
    } catch {
      return DEFAULT_PLUGIN_UPDATE_POLICY;
    }
  }

  async setUpdatePolicy(patch: Partial<PluginUpdatePolicy>): Promise<PluginUpdatePolicy> {
    return this.mutateInstalls(async () => {
      const policy = normalizeUpdatePolicy({ ...(await this.getUpdatePolicy()), ...patch });
      await this.settings.setPlainSetting(REGISTRY_PARENT, UPDATE_POLICY_KEY, JSON.stringify(policy));
      return policy;
    });
  }
}
