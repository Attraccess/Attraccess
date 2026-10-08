import { promises as dns } from 'node:dns';
import { get as httpGet, RequestOptions } from 'node:http';
import { get as httpsGet } from 'node:https';
import { isIP, LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';

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

export function requestDiscoveryJson(url: URL, timeoutMs = 5000, maxBytes = 1024 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Literal IPs bypass Node's lookup callback, so enforce the destination
    // policy here as well as while constructing a discovery URL.
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(hostname)) assertDiscoveryAddress(hostname);
    const get = url.protocol === 'https:' ? httpsGet : httpGet;
    // HTTP forwards this socket option, but RequestOptions omits it. Enable
    // fallback across the validated list while retaining one request deadline.
    const options: RequestOptions & { autoSelectFamily: true } = {
      agent: false,
      autoSelectFamily: true,
      lookup: discoveryLookup,
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
    };
    // Node's HTTP client never follows redirects. A 3xx response is rejected.
    const request = get(url, options, (response) => {
      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        response.destroy();
        reject(
          new UnauthorizedException(`Failed to fetch discovery: ${response.statusCode} ${response.statusMessage}`),
        );
        return;
      }
      let bytes = 0;
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          const error = new Error('Discovery response exceeds size limit');
          reject(error);
          request.destroy(error);
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('Invalid discovery JSON'));
        }
      });
    });
    request.on('error', reject);
  });
}
