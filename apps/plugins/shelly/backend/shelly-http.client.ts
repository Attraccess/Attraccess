// HTTP transport for talking to Shelly devices. Shared by every service that
// calls a device (info/auth, firmware, ...) so the credential handling lives in
// exactly one place.
//
// Shellies answer an unauthenticated request with 401 + a WWW-Authenticate
// challenge: Gen1 uses Basic, Gen2+ uses Digest (SHA-256). We therefore always
// try unauthenticated first and only replay the request with an Authorization
// header when the device asks for one.
import { createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';

const REQUEST_TIMEOUT_MS = 8000;

export interface DeviceCredentials {
  username?: string;
  currentPassword?: string;
}

@Injectable()
export class ShellyHttpClient {
  getJson(url: string, credentials: DeviceCredentials): Promise<unknown> {
    return this.requestJson(url, { method: 'GET', credentials });
  }

  postJson(url: string, body: unknown, credentials: DeviceCredentials): Promise<unknown> {
    return this.requestJson(url, { method: 'POST', body, credentials });
  }

  private async requestJson(
    url: string,
    options: { method: 'GET' | 'POST'; body?: unknown; credentials: DeviceCredentials },
  ): Promise<unknown> {
    const requestOptions = this.buildFetchOptions(options.method, options.body);
    let response = await fetch(url, requestOptions);

    if (response.status === 401 && options.credentials.currentPassword) {
      response = await fetch(url, {
        ...requestOptions,
        headers: {
          ...asHeaderRecord(requestOptions.headers),
          ...this.buildAuthHeader(response, url, options.method, options.credentials),
        },
      });
    }

    if (!response.ok) {
      throw new Error(`Shelly request ${url} failed: HTTP ${response.status}`);
    }
    return response.json();
  }

  private buildFetchOptions(method: 'GET' | 'POST', body: unknown): RequestInit {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    return {
      method,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    };
  }

  private buildAuthHeader(
    response: Response,
    url: string,
    method: string,
    credentials: DeviceCredentials,
  ): Record<string, string> {
    const username = credentials.username?.trim() || 'admin';
    const password = credentials.currentPassword ?? '';
    const challenge = response.headers.get('www-authenticate') ?? response.headers.get('WWW-Authenticate') ?? '';
    if (!challenge.toLowerCase().startsWith('digest ')) {
      return { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` };
    }
    return { Authorization: buildDigestAuthorization(challenge, url, method, username, password) };
  }
}

function asHeaderRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers;
}

function buildDigestAuthorization(
  challenge: string,
  url: string,
  method: string,
  username: string,
  password: string,
): string {
  const params = parseDigestChallenge(challenge);
  const algorithm = (params.algorithm ?? 'MD5').toUpperCase();
  const hash = algorithm.includes('SHA-256') ? sha256 : md5;
  const nonce = params.nonce;
  const realm = params.realm;
  if (!nonce || !realm) {
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  const requestUrl = new URL(url);
  const uri = `${requestUrl.pathname}${requestUrl.search}`;
  const qop = params.qop
    ?.split(',')
    .map((value) => value.trim())
    .includes('auth')
    ? 'auth'
    : undefined;
  const nc = '00000001';
  const cnonce = randomBytes(8).toString('hex');
  const ha1 = hash(`${username}:${realm}:${password}`);
  const ha2 = hash(`${method}:${uri}`);
  const response = qop ? hash(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : hash(`${ha1}:${nonce}:${ha2}`);
  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
    `algorithm=${algorithm}`,
  ];
  if (params.opaque) parts.push(`opaque="${params.opaque}"`);
  if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  return `Digest ${parts.join(', ')}`;
}

function parseDigestChallenge(challenge: string): Record<string, string> {
  const digest = challenge.replace(/^Digest\s+/i, '');
  const params: Record<string, string> = {};
  for (const match of digest.matchAll(/([a-zA-Z0-9_-]+)=(?:"([^"]*)"|([^,]*))/g)) {
    params[match[1].toLowerCase()] = match[2] ?? match[3] ?? '';
  }
  return params;
}

export function md5(value: string): string {
  return createHash('md5').update(value).digest('hex');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
