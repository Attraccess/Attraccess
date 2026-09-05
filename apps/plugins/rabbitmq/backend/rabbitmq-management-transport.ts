import type { MqttServerConnectionConfig } from '@attraccess/plugins-backend-sdk';
import { X509Certificate } from 'node:crypto';
import { request, RequestOptions } from 'node:https';
import { isIP } from 'node:net';

class TrustConfigurationError extends Error {}

export function managementApiBase(config: MqttServerConnectionConfig): string {
  const host = isIP(config.host) === 6 ? `[${config.host}]` : config.host;
  return `${config.useTls ? 'https' : 'http'}://${host}:${config.useTls ? 15671 : 15672}`;
}

function trustOptions(config: MqttServerConnectionConfig): RequestOptions {
  if (config.tlsInsecure) {
    throw new TrustConfigurationError(
      'RabbitMQ management requires certificate verification. Disable tlsInsecure and configure a trusted CA certificate.',
    );
  }
  const servername = config.tlsServername;
  if (
    servername != null &&
    (typeof servername !== 'string' ||
      servername.length > 253 ||
      !servername.split('.').every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label)) ||
      isIP(servername))
  ) {
    throw new TrustConfigurationError(
      'TLS server name must be a DNS hostname matching the management certificate, without a scheme or port.',
    );
  }
  if (config.caCert != null) {
    try {
      const pem = config.caCert;
      const certificates =
        typeof pem === 'string' ? pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) : null;
      if (
        !certificates?.length ||
        pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim()
      ) {
        throw new Error();
      }
      for (const certificate of certificates) new X509Certificate(certificate);
    } catch {
      throw new TrustConfigurationError(
        'Invalid CA certificate. Configure a PEM certificate or PEM certificate bundle.',
      );
    }
  }
  return {
    rejectUnauthorized: true,
    ...(config.caCert != null ? { ca: config.caCert } : {}),
    ...(servername != null ? { servername } : {}),
  };
}

// Both detection and credential operations use this transport. HTTPS never
// follows redirects or retries over HTTP, and verification cannot be disabled.
export async function managementRequest(
  config: MqttServerConnectionConfig,
  url: string,
  method: string,
  body: unknown,
  timeoutMs: number,
): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (config.username !== null) {
    headers.authorization = `Basic ${Buffer.from(`${config.username}:${config.password ?? ''}`, 'utf8').toString('base64')}`;
  }
  const payload = body === undefined ? undefined : JSON.stringify(body);
  if (payload !== undefined) headers['content-type'] = 'application/json';
  if (!config.useTls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { method, headers, body: payload, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
  const options = trustOptions(config);
  if (new URL(url).protocol !== 'https:') {
    throw new TrustConfigurationError('TLS is enabled: the RabbitMQ management endpoint must use HTTPS.');
  }
  return new Promise<Response>((resolve, reject) => {
    // No shared agent: another request cannot reuse a socket with different trust.
    const req = request(url, { ...options, agent: false, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      const maximumBytes = 8 * 1024 * 1024;
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maximumBytes) {
          chunks.length = 0;
          req.destroy(Object.assign(new Error(), { code: 'RESPONSE_TOO_LARGE' }));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      res.on('error', reject);
      res.on('aborted', () => reject(new Error('Response aborted')));
      res.on('end', () => {
        if (bytes > maximumBytes) return;
        const status = res.statusCode ?? 502;
        try {
          if (status < 200 || status > 599) throw new Error();
          resolve(
            new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks).toString('utf8'), { status }),
          );
        } catch {
          reject(Object.assign(new Error(), { code: 'INVALID_RESPONSE_STATUS' }));
        }
      });
    });
    const timeout = setTimeout(() => req.destroy(Object.assign(new Error(), { code: 'ETIMEDOUT' })), timeoutMs);
    req.on('error', reject);
    req.on('close', () => clearTimeout(timeout));
    req.end(payload);
  });
}

export function describeManagementError(error: unknown, timeoutMs: number): string {
  if (error instanceof TrustConfigurationError) return error.message;
  const outer = error as { code?: string; name?: string; cause?: { code?: string } } | null;
  const code = outer?.cause?.code ?? outer?.code;
  if (outer?.name === 'AbortError' || code === 'ETIMEDOUT')
    return `Management API did not respond within ${timeoutMs}ms.`;
  switch (code) {
    case 'RESPONSE_TOO_LARGE':
      return 'Management API response exceeded the 8 MiB limit.';
    case 'INVALID_RESPONSE_STATUS':
      return 'Management API returned an invalid HTTP status.';
    case 'CERT_HAS_EXPIRED':
    case 'CERT_NOT_YET_VALID':
      return 'TLS certificate is expired or not yet valid. Check the Attraccess host clock and the certificate validity dates; renew the certificate if necessary.';
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return 'TLS certificate hostname mismatch. Configure tlsServername to match the management certificate DNS name or correct the certificate.';
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'UNABLE_TO_GET_ISSUER_CERT':
    case 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY':
      return 'TLS certificate is not trusted. Configure the issuing CA PEM bundle and ensure the management server sends its intermediate certificates.';
    case 'ECONNREFUSED':
      return 'Management connection refused. Check the management listener and port.';
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'Management hostname could not be resolved. Check DNS and the configured host.';
    default:
      return 'Failed to reach the RabbitMQ management API. Check connectivity and, for HTTPS, the CA, certificate validity, host clock, and TLS server name.';
  }
}
