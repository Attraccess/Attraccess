import { minVersion, validRange } from 'semver';
import { z } from 'zod';
import { WIRE_VERSION } from './constants';
import { SEMVER_PATTERN } from './headers';

const exactVersion = z.string().max(64).regex(SEMVER_PATTERN);

/** One exact Matter release is shared by the plugin and the sidecar. */
export const supportedCombinationSchema = z.strictObject({
  wireVersion: z.literal(WIRE_VERSION),
  /** A semver range. Release headers are compatibility information, not authentication. */
  attraccess: z.string().min(1).max(64),
  plugin: exactVersion,
  sidecar: exactVersion,
  matterJs: exactVersion,
});
export type SupportedCombination = z.infer<typeof supportedCombinationSchema>;

/**
 * The single authoritative list of supported release combinations.
 * Plugin `package.json` (`attraccess.host`) and `plugin.json` (`attraccessVersion.min`) are derived from the
 * first entry's `attraccess` range and must match it; a test enforces that.
 * Every Attraccess, plugin or sidecar release that is not listed here is rejected.
 */
export const COMPATIBILITY_TABLE: readonly SupportedCombination[] = [
  {
    wireVersion: WIRE_VERSION,
    attraccess: '^1.11.0',
    plugin: '0.1.0-alpha.0',
    sidecar: '0.1.0-alpha.0',
    matterJs: '0.18.0',
  },
];

/** Minimum Attraccess version implied by the table's range (`^1.11.0` -> `1.11.0`). */
export function minimumAttraccessVersion(combination: SupportedCombination = COMPATIBILITY_TABLE[0]): string {
  const minimum = validRange(combination.attraccess) ? minVersion(combination.attraccess) : null;
  if (!minimum) throw new Error(`Unsupported Attraccess range in compatibility table: ${combination.attraccess}`);
  return minimum.version;
}
