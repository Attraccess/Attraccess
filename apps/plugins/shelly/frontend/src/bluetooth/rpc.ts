// Shelly Gen2+ JSON-RPC over Bluetooth LE. One call is four steps:
//   1. write the request's byte length (uint32, big endian) to the TX control char,
//   2. write the JSON body to the data char in small chunks,
//   3. poll the RX control char until it reports the response length,
//   4. read the data char until that many bytes have arrived.
// Calls the device answers with 401 are replayed with SHA-256 digest auth once
// credentials are set.
import { buildRpcAuth, parseChallenge, type DigestChallenge } from './digest';
import { RpcError, ShellyBleError } from './errors';
import type { RpcChannel } from './gatt';

const MAX_RESPONSE_BYTES = 1024 * 1024;

export interface RpcOptions {
  /** Web Bluetooth hides the negotiated MTU, so stay under the 23-byte floor. */
  chunkSize?: number;
  pollIntervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface RpcCaller {
  call<T>(method: string, params?: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<T>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function uint32BE(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

interface RpcEnvelope {
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string };
}

/** Maps any transport-level failure to a link-lost error, never echoing request data. */
async function transport<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (err) {
    if (err instanceof ShellyBleError) throw err;
    throw new ShellyBleError('linkLost', 'The Bluetooth connection to the device was lost');
  }
}

export class ShellyBleRpc implements RpcCaller {
  private nextId = 1;
  private credentials?: { username: string; password: string };
  private challenge?: DigestChallenge;
  private nc = 0;
  /** The GATT channel carries one request at a time; concurrent calls would interleave their frames. */
  private queue: Promise<unknown> = Promise.resolve();
  private readonly chunkSize: number;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    private readonly channel: RpcChannel,
    options: RpcOptions = {},
  ) {
    this.chunkSize = options.chunkSize ?? 20;
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
  }

  /** Authenticate later calls with digest auth. Held in memory only. */
  setCredentials(username: string, password: string): void {
    this.credentials = { username, password };
    this.challenge = undefined;
  }

  /** Calls run one after another, in the order they were made. */
  call<T>(method: string, params?: Record<string, unknown>, options: { timeoutMs?: number } = {}): Promise<T> {
    const result = this.queue.then(() => this.callNow<T>(method, params, options));
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async callNow<T>(
    method: string,
    params: Record<string, unknown> | undefined,
    options: { timeoutMs?: number },
  ): Promise<T> {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const creds = this.credentials;
    // Reuse the last challenge so authenticated calls need one round trip; a
    // stale nonce just costs one extra 401 below.
    let auth = creds && this.challenge ? await this.authFor(this.challenge, creds) : undefined;
    let usedFreshChallenge = false;
    for (let tries = 0; tries < 3; tries++) {
      const envelope = await this.exchange(method, params, auth, timeoutMs);
      if (!envelope.error) return envelope.result as T;
      if (envelope.error.code !== 401) {
        throw new RpcError(method, envelope.error.code, envelope.error.message ?? 'unknown error');
      }
      if (!creds) throw new ShellyBleError('authRequired', `${method}: the device requires its admin password`);
      const challenge = parseChallenge(envelope.error.message);
      // A challenge we answered a moment ago and were refused again: wrong password.
      if (auth && (usedFreshChallenge || !challenge)) {
        throw new ShellyBleError('wrongPassword', `${method}: the admin password was rejected`);
      }
      if (!challenge) throw new RpcError(method, 401, 'unreadable authentication challenge');
      usedFreshChallenge = true;
      this.challenge = challenge;
      this.nc = 0;
      auth = await this.authFor(challenge, creds);
    }
    throw new ShellyBleError('wrongPassword', `${method}: the admin password was rejected`);
  }

  private authFor(challenge: DigestChallenge, creds: { username: string; password: string }) {
    this.nc += 1;
    return buildRpcAuth(challenge, creds.username, creds.password, undefined, this.nc);
  }

  private async exchange(
    method: string,
    params: Record<string, unknown> | undefined,
    auth: unknown,
    timeoutMs: number,
  ): Promise<RpcEnvelope> {
    const frame = new TextEncoder().encode(
      JSON.stringify({
        id: this.nextId++,
        src: 'attraccess',
        method,
        ...(params ? { params } : {}),
        ...(auth ? { auth } : {}),
      }),
    );

    await transport(async () => {
      await this.channel.txControl.writeValue(uint32BE(frame.length));
      for (let offset = 0; offset < frame.length; offset += this.chunkSize) {
        await this.channel.data.writeValue(frame.subarray(offset, offset + this.chunkSize));
      }
    });

    const raw = new TextDecoder().decode(await this.readResponse(timeoutMs));
    try {
      return JSON.parse(raw) as RpcEnvelope;
    } catch {
      throw new ShellyBleError('malformedResponse', `${method}: the device sent a malformed response`);
    }
  }

  private async readResponse(timeoutMs: number): Promise<Uint8Array> {
    const length = await this.awaitResponseLength(timeoutMs);
    if (length > MAX_RESPONSE_BYTES) {
      throw new ShellyBleError('responseTooLarge', `Bluetooth response is too large (${length} bytes)`);
    }
    const out = new Uint8Array(length);
    let filled = 0;
    while (filled < length) {
      const view = await transport(() => this.channel.data.readValue());
      if (view.byteLength === 0) {
        throw new ShellyBleError('linkLost', 'The device stopped sending its response');
      }
      const chunk = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      const take = Math.min(chunk.length, length - filled);
      out.set(chunk.subarray(0, take), filled);
      filled += take;
    }
    return out;
  }

  private async awaitResponseLength(timeoutMs: number): Promise<number> {
    const deadline = this.now() + timeoutMs;
    for (;;) {
      const view = await transport(() => this.channel.rxControl.readValue());
      const length = view.byteLength >= 4 ? view.getUint32(0, false) : 0;
      if (length > 0) return length;
      if (this.now() >= deadline) {
        throw new ShellyBleError('timeout', 'Timed out waiting for the device to answer over Bluetooth');
      }
      await this.sleep(this.pollIntervalMs);
    }
  }
}
