export const HEADER_WIRE_VERSION = 'x-matter-wire-version';
export const HEADER_ATTRACCESS_VERSION = 'x-attraccess-version';
export const HEADER_PLUGIN_VERSION = 'x-matter-plugin-version';
export const HEADER_SIDECAR_VERSION = 'x-matter-sidecar-version';
export const HEADER_CORRELATION_ID = 'x-correlation-id';
export const HEADER_REQUEST_DEADLINE = 'x-request-deadline-ms';

/** Strict semver (no leading v, no build metadata beyond 64 chars). Used to decide whether a value may be echoed. */
export const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function isWellFormedVersion(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && SEMVER_PATTERN.test(value);
}
