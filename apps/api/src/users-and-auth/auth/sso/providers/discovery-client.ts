import { promises as dns } from 'node:dns';
import { get as httpGet, RequestOptions } from 'node:http';
import { get as httpsGet } from 'node:https';
import { isIP, LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';
import { BadGatewayException, BadRequestException, HttpException, Logger } from '@nestjs/common';

const logger = new Logger('SsoDiscovery');

// Private and loopback IdPs are supported. Metadata services and non-unicast
// destinations are not IdPs, including their IPv4-mapped IPv6 representations.
export function assertDiscoveryAddress(address: string): void {
  const ip = ipaddr.process(address);
  const allowed = ['unicast', 'private', 'loopback', 'uniqueLocal', 'carrierGradeNat'];
  const metadata = ['168.63.129.16', '100.100.100.200', 'fd00:ec2::254'];
  if (!allowed.includes(ip.range()) || metadata.includes(ip.toString())) {
    throw new BadRequestException('Invalid discovery destination');
  }
}

export function discoveryUrl(host: string, path: string): URL {
  try {
    if (typeof host !== 'string' || /[\s\\?#]/.test(host)) throw new Error();
    const url = new URL(/^https?:\/\//i.test(host) ? host : `http://${host}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/') {
      throw new Error();
    }
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(hostname)) assertDiscoveryAddress(hostname);
    url.pathname = path;
    return url;
  } catch {
    throw new BadRequestException('Invalid discovery host: expected an HTTP(S) origin');
  }
}

export function discoveryPathSegment(value: string): string {
  let decoded = value;
  // Upstream servers may decode again before normalizing their paths. Inspect
  // nested escapes too, while bounding the work and preserving literal '%'.
  for (let depth = 0; depth < 8; depth++) {
    if (!decoded || ['.', '..'].includes(decoded) || /[/\\;]/.test(decoded)) {
      throw new BadRequestException('Invalid discovery path');
    }
    const next = decoded.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    if (next === decoded) return encodeURIComponent(value);
    decoded = next;
  }
  throw new BadRequestException('Invalid discovery path');
}

// Validate every answer before returning the exact list to the socket. Node can
// try alternate addresses without a second, unchecked DNS resolution.
export const discoveryLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, verbatim: true }).then(
    (answers) => {
      try {
        if (!answers.length) throw new Error('Discovery host has no addresses');
        answers.forEach(({ address }) => assertDiscoveryAddress(address));
        if (options.all) callback(null, answers);
        else callback(null, answers[0].address, answers[0].family);
      } catch (error) {
        callback(error as Error, '', 0);
      }
    },
    (error: Error) => callback(error, '', 0),
  );
};

// Node's codes for a peer certificate that failed verification. Other TLS
// errors, such as handshake failures, are reported as unreachable.
export const DISCOVERY_CERTIFICATE_ERROR_CODES: ReadonlySet<string> = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'HOSTNAME_MISMATCH',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_SIGNATURE_FAILURE',
  'CERT_UNTRUSTED',
  'CERT_REJECTED',
  'CERT_REVOKED',
  'INVALID_CA',
  'CERT_CHAIN_TOO_LONG',
  'PATH_LENGTH_EXCEEDED',
  'INVALID_PURPOSE',
  'UNABLE_TO_DECRYPT_CERT_SIGNATURE',
  'UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY',
  'ERROR_IN_CERT_NOT_BEFORE_FIELD',
  'ERROR_IN_CERT_NOT_AFTER_FIELD',
]);

// Policy rejections keep their status. Anything else failed on the way to the
// upstream; report only the admin-supplied origin and an error code, because
// deeper messages can contain resolved addresses. Operators get the full cause.
export function toDiscoveryError(error: unknown, url: URL, timedOut: boolean, timeoutMs: number): HttpException {
  if (error instanceof HttpException) return error;
  logger.warn(`Discovery request to ${url.origin} failed: ${String(error)}`);
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (!timedOut && code && DISCOVERY_CERTIFICATE_ERROR_CODES.has(code)) {
    return new BadGatewayException(
      `TLS certificate of the discovery URL could not be verified: ${url.origin} (${code})`,
    );
  }
  const reason = timedOut ? `timed out after ${timeoutMs} ms` : code;
  return new BadGatewayException(`Discovery URL could not be reached: ${url.origin}${reason ? ` (${reason})` : ''}`);
}

export function requestDiscoveryJson(url: URL, timeoutMs = 5000, maxBytes = 1024 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Literal IPs bypass Node's lookup callback, so enforce the destination
    // policy here as well as while constructing a discovery URL.
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(hostname)) assertDiscoveryAddress(hostname);
    const signal = AbortSignal.timeout(timeoutMs);
    const fail = (error: unknown) => reject(toDiscoveryError(error, url, signal.aborted, timeoutMs));
    const get = url.protocol === 'https:' ? httpsGet : httpGet;
    // HTTP forwards this socket option, but RequestOptions omits it. Enable
    // fallback across the validated list while retaining one request deadline.
    const options: RequestOptions & { autoSelectFamily: true } = {
      agent: false,
      autoSelectFamily: true,
      lookup: discoveryLookup,
      signal,
      headers: { Accept: 'application/json' },
    };
    // Node's HTTP client never follows redirects. A 3xx response is rejected.
    // The requested URL holds no secrets; the upstream reason, headers and body
    // are never echoed.
    const request = get(url, options, (response) => {
      const { statusCode } = response;
      if (!statusCode || statusCode < 200 || statusCode >= 300) {
        response.destroy();
        const status = statusCode ?? 'unknown';
        logger.warn(`Discovery request to ${url.href} answered with status ${status}`);
        reject(new BadGatewayException(`Discovery URL answered with status ${status}: ${url.href}`));
        return;
      }
      let bytes = 0;
      const chunks: Buffer[] = [];
      // Destroying an oversized response can still emit 'error' or 'end'; the
      // request has already failed, so those events must not log again.
      let oversized = false;
      response.on('data', (chunk: Buffer) => {
        if (oversized) return;
        bytes += chunk.length;
        if (bytes > maxBytes) {
          oversized = true;
          const error = new BadGatewayException('Discovery response exceeds size limit');
          logger.warn(`Discovery response from ${url.origin} exceeds ${maxBytes} bytes`);
          reject(error);
          request.destroy(error);
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', (error) => {
        if (!oversized) fail(error);
      });
      response.on('end', () => {
        if (oversized) return;
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (error) {
          logger.warn(`Discovery response from ${url.origin} is not valid JSON: ${String(error)}`);
          reject(new BadGatewayException('Invalid discovery JSON'));
        }
      });
    });
    request.on('error', fail);
  });
}
