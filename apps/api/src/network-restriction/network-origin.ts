import { isIP } from 'net';
import { NetworkIpSource } from '@attraccess/application-models';
import { normalizeAddress } from '../cidr-matcher';
import type { NetworkRestrictionConfig } from './network-restriction.config';

/** The part of an HTTP request the origin is derived from. */
export interface OriginRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Origins decided before the request reached the Nest pipeline: an MCP tool call is judged by the outer MCP request,
 * so the gateway attaches that origin to the inner request in memory. A request cannot set this itself.
 */
const attachedOrigins = new WeakMap<object, string | null>();

export function attachNetworkOrigin(request: object, address: string | null): void {
  attachedOrigins.set(request, address);
}

function cleanAddress(value: string | undefined): string | null {
  const candidate = value?.trim().split('%')[0] ?? '';
  return candidate !== '' && isIP(candidate) !== 0 ? normalizeAddress(candidate) : null;
}

/** The last (rightmost) entry of a header, the one the nearest proxy wrote. */
function lastHeaderEntry(value: string | string[] | undefined): string | undefined {
  const joined = Array.isArray(value) ? value.join(',') : value;
  return joined
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .pop();
}

/** The caller's address, or null when it cannot be determined (the caller then counts as outside). */
export function resolveNetworkOrigin(request: OriginRequest, config: NetworkRestrictionConfig): string | null {
  if (attachedOrigins.has(request)) return attachedOrigins.get(request) ?? null;
  if (config.ipSource === NetworkIpSource.Header) {
    return cleanAddress(lastHeaderEntry(request.headers[config.headerName.toLowerCase()]));
  }
  return cleanAddress(request.ip);
}
