import { BadRequestException } from '@nestjs/common';
import * as semver from 'semver';
import { InstalledNpmPlugin } from './npm-install-definitions';
import { InstalledNpmPluginVersion } from './npm-marketplace-definitions';

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
