import {
  SERVICE_TOKEN_PATTERN,
  DEFAULT_REPLAY_MAX_AGE_MS,
  DEFAULT_REPLAY_MAX_EVENTS,
  DEFAULT_REQUEST_DEADLINE_MS,
  DEFAULT_SHUTDOWN_GRACE_MS,
  MAX_MESSAGE_BYTES,
} from '@attraccess/matter-contract';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isIPv6 } from 'node:net';
import { z } from 'zod';

export const LOOPBACK_HOST = '127.0.0.1';

const TOKEN_HINT = '32-512 printable ASCII characters, for example `openssl rand -base64 48`';

/** True for the loopback bind addresses and names. Anything else (0.0.0.0, ::, a LAN address) is a remote bind. */
export function isLoopbackHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '').toLowerCase();
  return bare === 'localhost' || bare === '::1' || /^127(\.\d{1,3}){3}$/.test(bare);
}

const HOST_NAME = /^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/;

/**
 * One `MATTER_SIDECAR_ALLOWED_HOSTS` entry in the form a `Host` header carries it: lowercase, without a trailing dot, and
 * an IPv6 literal in brackets. Null when the entry is not a bare host name or address, such as one with a port, a scheme
 * or a path.
 */
export function normaliseAllowedHost(entry: string): string | null {
  const host = entry.trim().toLowerCase().replace(/\.$/, '');
  const literal = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (isIPv6(literal)) return `[${literal}]`;
  return HOST_NAME.test(host) ? host : null;
}

function readAllowedHosts(value: string | undefined, problems: string[]): string[] {
  const allowed: string[] = [];
  for (const entry of (value ?? '').split(',').map((item) => item.trim())) {
    if (entry === '') continue;
    const host = normaliseAllowedHost(entry);
    if (host === null) {
      problems.push(
        `MATTER_SIDECAR_ALLOWED_HOSTS: "${entry}" is not a host name; ` +
          'list bare names or IP addresses without a scheme, port or path',
      );
    } else if (!allowed.includes(host)) {
      allowed.push(host);
    }
  }
  return allowed;
}

// An empty or blank variable (`MATTER_SIDECAR_PORT=` in an env file) means "not set". Without this, coercion turns it
// into 0, which for the port silently picks a random one.
const unsetWhenBlank = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const integer = (min: number, max: number, fallback: number) =>
  z.preprocess(unsetWhenBlank, z.coerce.number().int().min(min).max(max).default(fallback));
const positiveInt = (fallback: number, max: number) => integer(1, max, fallback);

const optionalString = z.preprocess(unsetWhenBlank, z.string().optional());
const optionalBoolean = z.preprocess(
  (value) => (typeof value === 'string' ? (unsetWhenBlank(value.trim().toLowerCase()) ?? undefined) : value),
  z.enum(['true', 'false']).optional(),
);

const configSchema = z.object({
  MATTER_SIDECAR_BIND_HOST: optionalString,
  MATTER_SIDECAR_ALLOWED_HOSTS: optionalString,
  MATTER_SIDECAR_AUTH_TOKEN: optionalString,
  MATTER_SIDECAR_AUTH_TOKEN_FILE: optionalString,
  MATTER_SIDECAR_AUTH_TOKEN_PREVIOUS: optionalString,
  MATTER_SIDECAR_AUTH_TOKEN_PREVIOUS_FILE: optionalString,
  MATTER_SIDECAR_TLS_CERT_FILE: optionalString,
  MATTER_SIDECAR_TLS_KEY_FILE: optionalString,
  MATTER_SIDECAR_ALLOW_INSECURE_REMOTE: optionalBoolean,
  MATTER_SIDECAR_STORAGE_DIR: optionalString,
  MATTER_SIDECAR_MATTER_PORT: integer(0, 65_535, 0),
  MATTER_SIDECAR_PORT: integer(0, 65_535, 8581),
  MATTER_SIDECAR_MAX_MESSAGE_BYTES: positiveInt(MAX_MESSAGE_BYTES, 16 * 1024 * 1024),
  MATTER_SIDECAR_REQUEST_DEADLINE_MS: positiveInt(DEFAULT_REQUEST_DEADLINE_MS, 60_000),
  MATTER_SIDECAR_SHUTDOWN_GRACE_MS: positiveInt(DEFAULT_SHUTDOWN_GRACE_MS, 60_000),
  MATTER_SIDECAR_REPLAY_MAX_EVENTS: positiveInt(DEFAULT_REPLAY_MAX_EVENTS, 100_000),
  MATTER_SIDECAR_REPLAY_MAX_AGE_MS: positiveInt(DEFAULT_REPLAY_MAX_AGE_MS, 24 * 3_600_000),
  MATTER_SIDECAR_CLIENT_QUEUE_BYTES: positiveInt(MAX_MESSAGE_BYTES, 64 * 1024 * 1024),
});

export type SidecarConfig = {
  /** Loopback unless `MATTER_SIDECAR_BIND_HOST` says otherwise. */
  host: string;
  port: number;
  /** The current service token first, then the previous one while it is being rotated out. */
  authTokens: string[];
  /** Extra `Host` names accepted besides loopback, normalised by `normaliseAllowedHost`. */
  allowedHosts: string[];
  tls: { cert: Buffer; key: Buffer } | null;
  /** True when the sidecar serves plain HTTP on a non-loopback address (explicitly allowed by the operator). */
  insecureRemote: boolean;
  /** Where the fabric and the controller state are persisted. Needs its own persistent volume. */
  storageDir: string;
  /** UDP port of the controller's Matter endpoint; 0 picks a free port. */
  matterPort: number;
  maxMessageBytes: number;
  requestDeadlineMs: number;
  shutdownGraceMs: number;
  replayMaxEvents: number;
  replayMaxAgeMs: number;
  clientQueueBytes: number;
  maxClients: number;
  firstMessageTimeoutMs: number;
};

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid sidecar configuration: ${problems.join('; ')}`);
  }
}

type FileReader = (path: string) => string;

/** Resolves one token from `NAME` or `NAME_FILE`. Both set is a config error. Problems are appended, never thrown. */
function resolveToken(
  name: string,
  values: { inline?: string; file?: string },
  readFile: FileReader,
  problems: string[],
): string | undefined {
  if (values.inline !== undefined && values.file !== undefined) {
    problems.push(`${name} and ${name}_FILE are both set; set only one`);
    return undefined;
  }
  let token = values.inline;
  if (values.file !== undefined) {
    try {
      token = readFile(values.file).trim();
    } catch {
      problems.push(`${name}_FILE: cannot read the file`);
      return undefined;
    }
  }
  if (token === undefined) return undefined;
  if (!SERVICE_TOKEN_PATTERN.test(token)) {
    const source = values.file !== undefined ? `${name}_FILE` : name;
    problems.push(`${source}: the token must be ${TOKEN_HINT}`);
    return undefined;
  }
  return token;
}

function readTls(env: z.infer<typeof configSchema>, readFile: FileReader, problems: string[]) {
  const certPath = env.MATTER_SIDECAR_TLS_CERT_FILE;
  const keyPath = env.MATTER_SIDECAR_TLS_KEY_FILE;
  if (certPath === undefined && keyPath === undefined) return null;
  if (certPath === undefined || keyPath === undefined) {
    problems.push(
      `${certPath === undefined ? 'MATTER_SIDECAR_TLS_CERT_FILE' : 'MATTER_SIDECAR_TLS_KEY_FILE'}: ` +
        'set both MATTER_SIDECAR_TLS_CERT_FILE and MATTER_SIDECAR_TLS_KEY_FILE, or neither',
    );
    return null;
  }
  try {
    return { cert: Buffer.from(readFile(certPath)), key: Buffer.from(readFile(keyPath)) };
  } catch {
    problems.push(
      'MATTER_SIDECAR_TLS_CERT_FILE / MATTER_SIDECAR_TLS_KEY_FILE: cannot read the certificate or key file',
    );
    return null;
  }
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  readFile: FileReader = (path) => readFileSync(path, 'utf8'),
): SidecarConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  const values = result.data;
  const problems: string[] = [];
  const current = resolveToken(
    'MATTER_SIDECAR_AUTH_TOKEN',
    { inline: values.MATTER_SIDECAR_AUTH_TOKEN, file: values.MATTER_SIDECAR_AUTH_TOKEN_FILE },
    readFile,
    problems,
  );
  const previous = resolveToken(
    'MATTER_SIDECAR_AUTH_TOKEN_PREVIOUS',
    { inline: values.MATTER_SIDECAR_AUTH_TOKEN_PREVIOUS, file: values.MATTER_SIDECAR_AUTH_TOKEN_PREVIOUS_FILE },
    readFile,
    problems,
  );
  const configuredCurrent =
    values.MATTER_SIDECAR_AUTH_TOKEN !== undefined || values.MATTER_SIDECAR_AUTH_TOKEN_FILE !== undefined;
  if (!configuredCurrent) {
    problems.push(
      `MATTER_SIDECAR_AUTH_TOKEN: a service token is required. Set MATTER_SIDECAR_AUTH_TOKEN or ` +
        `MATTER_SIDECAR_AUTH_TOKEN_FILE (${TOKEN_HINT})`,
    );
  }
  const host = values.MATTER_SIDECAR_BIND_HOST ?? LOOPBACK_HOST;
  const remote = !isLoopbackHost(host);
  const allowedHosts = readAllowedHosts(values.MATTER_SIDECAR_ALLOWED_HOSTS, problems);
  const tls = readTls(values, readFile, problems);
  const allowInsecure = values.MATTER_SIDECAR_ALLOW_INSECURE_REMOTE === 'true';
  if (remote && allowedHosts.length === 0) {
    problems.push(
      'MATTER_SIDECAR_ALLOWED_HOSTS: required when MATTER_SIDECAR_BIND_HOST is not loopback; ' +
        'list the host names clients use, comma separated',
    );
  }
  if (remote && !tls && !allowInsecure) {
    problems.push(
      'MATTER_SIDECAR_TLS_CERT_FILE / MATTER_SIDECAR_TLS_KEY_FILE: a non-loopback bind needs TLS. ' +
        'Set both, or set MATTER_SIDECAR_ALLOW_INSECURE_REMOTE=true for a trusted container network or a TLS-terminating proxy',
    );
  }
  if (problems.length > 0) throw new ConfigError(problems);
  return {
    host,
    port: values.MATTER_SIDECAR_PORT,
    authTokens: [current as string, ...(previous ? [previous] : [])],
    allowedHosts,
    tls,
    insecureRemote: remote && !tls,
    storageDir: resolve(values.MATTER_SIDECAR_STORAGE_DIR ?? './matter-storage'),
    matterPort: values.MATTER_SIDECAR_MATTER_PORT,
    maxMessageBytes: values.MATTER_SIDECAR_MAX_MESSAGE_BYTES,
    requestDeadlineMs: values.MATTER_SIDECAR_REQUEST_DEADLINE_MS,
    shutdownGraceMs: values.MATTER_SIDECAR_SHUTDOWN_GRACE_MS,
    replayMaxEvents: values.MATTER_SIDECAR_REPLAY_MAX_EVENTS,
    replayMaxAgeMs: values.MATTER_SIDECAR_REPLAY_MAX_AGE_MS,
    clientQueueBytes: values.MATTER_SIDECAR_CLIENT_QUEUE_BYTES,
    maxClients: 64,
    firstMessageTimeoutMs: 30_000,
  };
}
