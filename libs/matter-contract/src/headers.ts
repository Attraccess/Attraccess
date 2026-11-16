import { WIRE_VERSION } from './constants';

export const HEADER_WIRE_VERSION = 'x-matter-wire-version';
export const HEADER_ATTRACCESS_VERSION = 'x-attraccess-version';
export const HEADER_PLUGIN_VERSION = 'x-matter-plugin-version';
export const HEADER_SIDECAR_VERSION = 'x-matter-sidecar-version';
export const HEADER_CORRELATION_ID = 'x-correlation-id';
export const HEADER_REQUEST_DEADLINE = 'x-request-deadline-ms';
export const HEADER_AUTHORIZATION = 'authorization';

/** Service tokens are 32-512 printable ASCII characters (no whitespace or control characters). */
export const SERVICE_TOKEN_PATTERN = /^[\x21-\x7e]{32,512}$/;

/** Strict semver (no leading v, no build metadata beyond 64 chars). Used to decide whether a value may be echoed. */
export const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function isWellFormedVersion(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && SEMVER_PATTERN.test(value);
}

export type RequestHeaderInput = {
  attraccessVersion: string;
  pluginVersion: string;
  sidecarVersion: string;
  correlationId: string;
  deadlineMs?: number;
  token?: string;
};

/** Headers every versioned request and the event-stream upgrade carry. The token is only ever sent as a Bearer header. */
export function buildRequestHeaders(input: RequestHeaderInput): Record<string, string> {
  return {
    [HEADER_WIRE_VERSION]: String(WIRE_VERSION),
    [HEADER_ATTRACCESS_VERSION]: input.attraccessVersion,
    [HEADER_PLUGIN_VERSION]: input.pluginVersion,
    [HEADER_SIDECAR_VERSION]: input.sidecarVersion,
    [HEADER_CORRELATION_ID]: input.correlationId,
    ...(input.deadlineMs !== undefined ? { [HEADER_REQUEST_DEADLINE]: String(Math.ceil(input.deadlineMs)) } : {}),
    ...(input.token !== undefined ? { [HEADER_AUTHORIZATION]: `Bearer ${input.token}` } : {}),
  };
}
