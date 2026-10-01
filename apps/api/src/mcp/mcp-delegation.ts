import { createHmac, timingSafeEqual } from 'crypto';

export type McpDelegationClaims = { userId: number; permissions: string[]; expiresAt: number };

export function signMcpDelegation(secret: string, claims: McpDelegationClaims): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyMcpDelegation(secret: string, value: string): McpDelegationClaims | null {
  const [body, signature, extra] = value.split('.');
  if (!body || !signature || extra !== undefined) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as McpDelegationClaims;
    if (
      !Number.isSafeInteger(claims.userId) ||
      !Array.isArray(claims.permissions) ||
      claims.permissions.some((permission) => typeof permission !== 'string') ||
      !Number.isSafeInteger(claims.expiresAt) ||
      claims.expiresAt <= Date.now() ||
      claims.expiresAt > Date.now() + 60_000
    ) return null;
    return claims;
  } catch {
    return null;
  }
}
