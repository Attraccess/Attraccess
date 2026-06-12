// Shared access to the RabbitMQ management HTTP API (ATT-521 / ATT-523).
//
// Both detection (ATT-521) and the connections viewer (ATT-523) talk to the
// same management API derived from the generic MQTT server config. This module
// owns that mapping — base URL construction, basic-auth header, and a fetch
// with a timeout — so every feature probes the broker the same way.
import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';

// Default RabbitMQ management API ports. The management API is independent of
// the MQTT listener, so we cannot reuse the MQTT port — RabbitMQ serves
// management over 15672 (HTTP) / 15671 (HTTPS) by convention.
const MGMT_PORT_HTTP = 15672;
const MGMT_PORT_HTTPS = 15671;

// Request timeout — a broker that doesn't answer quickly is treated as
// unreachable rather than blocking the request.
export const MGMT_TIMEOUT_MS = 5_000;

// Builds the management API base URL from the generic MQTT config. The
// management API runs on its own port, so we substitute the conventional
// management port for the MQTT one and pick the scheme from useTls.
export function managementApiBase(config: MqttServerConnectionConfig): string {
  const scheme = config.useTls ? 'https' : 'http';
  const port = config.useTls ? MGMT_PORT_HTTPS : MGMT_PORT_HTTP;
  return `${scheme}://${config.host}:${port}`;
}

function authHeader(config: MqttServerConnectionConfig): Record<string, string> {
  if (config.username === null) {
    return {};
  }
  const credentials = `${config.username}:${config.password ?? ''}`;
  // Encode the basic-auth pair as base64 (Buffer is always available in the
  // host Node runtime).
  const encoded = Buffer.from(credentials, 'utf8').toString('base64');
  return { authorization: `Basic ${encoded}` };
}

// Fetches a management API path with the config's credentials and a timeout.
// Throws on network-level failures (connection refused / DNS / TLS / timeout);
// HTTP error statuses are returned for the caller to interpret.
export async function fetchManagementApi(
  config: MqttServerConnectionConfig,
  path: string,
  init: Omit<RequestInit, 'headers' | 'signal'> = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MGMT_TIMEOUT_MS);
  try {
    return await fetch(`${managementApiBase(config)}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        ...authHeader(config),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// Maps a fetch-level failure to a human-readable reason.
export function describeManagementApiError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return `Management API did not respond within ${MGMT_TIMEOUT_MS}ms.`;
    }
    return error.message;
  }
  return 'Failed to reach the RabbitMQ management API.';
}
