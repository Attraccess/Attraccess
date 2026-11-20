import type { ConnectionStatus } from './api';

/** The feature families of `@attraccess/matter-contract`, as the sidecar reports them. */
export const FEATURE_FAMILIES = [
  'health',
  'fabric',
  'commissioning',
  'inventory',
  'commands',
  'subscriptions',
  'thread',
  'ota',
  'backup',
] as const;
export type FeatureFamily = (typeof FEATURE_FAMILIES)[number];

/**
 * `available`: the connected sidecar reports the family and implements it. `unavailable`: it reports the family as not
 * implemented, or does not report it. `unknown`: no sidecar answer yet (not connected), so nothing can be said.
 */
export type FamilyAvailability = 'available' | 'unavailable' | 'unknown';

export function familyAvailability(status: ConnectionStatus | null, family: FeatureFamily): FamilyAvailability {
  if (status?.state !== 'connected' || !status.capabilities) return 'unknown';
  return status.capabilities.capabilities.some((entry) => entry.family === family && entry.available)
    ? 'available'
    : 'unavailable';
}
