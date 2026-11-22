// SHA-256 digest auth for Shelly Gen2+ RPC. Mirrors the backend's
// communication/http-client.ts, with the RPC flavour of the spec: the request
// carries an `auth` object and ha2 is the fixed sha256("dummy_method:dummy_uri").

export interface DigestChallenge {
  realm: string;
  nonce: number | string;
  nc?: number;
  algorithm?: string;
}

export interface RpcAuth {
  realm: string;
  username: string;
  nonce: number | string;
  cnonce: number;
  nc: number;
  algorithm: 'SHA-256';
  response: string;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** `ha1` as stored by `Shelly.SetAuth`: sha256("<user>:<realm>:<password>"). */
export function computeHa1(username: string, realm: string, password: string): Promise<string> {
  return sha256Hex(`${username}:${realm}:${password}`);
}

/** A fresh client nonce per auth object, from the platform CSPRNG. */
function randomCnonce(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
}

export async function buildRpcAuth(
  challenge: DigestChallenge,
  username: string,
  password: string,
  cnonce: number = randomCnonce(),
  nc = 1,
): Promise<RpcAuth> {
  const ha1 = await computeHa1(username, challenge.realm, password);
  const ha2 = await sha256Hex('dummy_method:dummy_uri');
  const response = await sha256Hex(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`);
  return {
    realm: challenge.realm,
    username,
    nonce: challenge.nonce,
    cnonce,
    nc,
    algorithm: 'SHA-256',
    response,
  };
}

/** Reads the digest challenge out of a 401 error's message, or undefined when it is not one. */
export function parseChallenge(message: string | undefined): DigestChallenge | undefined {
  if (!message) return undefined;
  try {
    const parsed = JSON.parse(message) as Partial<DigestChallenge>;
    if (parsed && typeof parsed.realm === 'string' && parsed.nonce !== undefined) {
      return { realm: parsed.realm, nonce: parsed.nonce, nc: parsed.nc, algorithm: parsed.algorithm };
    }
  } catch {
    // Not a challenge.
  }
  return undefined;
}
