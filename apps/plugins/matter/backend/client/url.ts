import { SidecarMisconfiguredError } from './errors';

export type SidecarEndpoint = {
  secure: boolean;
  /** `http(s)://host:port` without any path. */
  origin: string;
  hostname: string;
  /** Reverse-proxy path prefix without a trailing slash, or an empty string. */
  prefix: string;
};

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export const isLoopbackHostname = (hostname: string): boolean =>
  LOOPBACK.has(hostname.toLowerCase()) || /^127(\.\d{1,3}){3}$/.test(hostname);

export function parseEndpoint(url: string): SidecarEndpoint {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SidecarMisconfiguredError('The sidecar URL is not a valid URL.', { code: 'invalid_url' });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SidecarMisconfiguredError('The sidecar URL must use http or https.', { code: 'invalid_url' });
  }
  return {
    secure: parsed.protocol === 'https:',
    origin: parsed.origin,
    hostname: parsed.hostname,
    prefix: parsed.pathname.replace(/\/+$/, ''),
  };
}

/** Plain HTTP to anything but this machine: the service token would cross the network unencrypted. */
export function isInsecureTransport(url: string | null): boolean {
  if (!url) return false;
  try {
    const endpoint = parseEndpoint(url);
    return !endpoint.secure && !isLoopbackHostname(endpoint.hostname);
  } catch {
    return false;
  }
}

/** `https://host/prefix` + `/v1/events` -> `wss://host/prefix/v1/events`. */
export function eventsUrl(endpoint: SidecarEndpoint, path: string): string {
  return `${endpoint.origin.replace(/^http/, 'ws')}${endpoint.prefix}${path}`;
}
