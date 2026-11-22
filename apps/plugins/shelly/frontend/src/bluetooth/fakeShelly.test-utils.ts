// A protocol-faithful fake Shelly for tests: real mOS framing (length on TX
// control, 20-byte data chunks, length on RX control, chunked reads) in front
// of a handler that answers decoded RPC requests. Test support only.
import { sha256Hex } from './digest';
import type { RpcChannel } from './gatt';

export interface FakeRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
  auth?: Record<string, unknown>;
}

/**
 * `silence` never answers. `late` answers nothing now but queues its reply in
 * front of the next request's, like a device whose reply arrives after the
 * caller gave up.
 */
export type FakeReply =
  | { result: unknown }
  | { error: { code: number; message: string } }
  | 'silence'
  | { late: { result: unknown } | { error: { code: number; message: string } } };

export interface FakeShelly {
  channel: RpcChannel;
  requests: FakeRequest[];
  /** Raw frames exactly as written to the device. */
  frames: string[];
  writes: Array<{ target: 'tx' | 'data'; bytes: number }>;
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function createFakeShelly(
  handler: (req: FakeRequest) => FakeReply | Promise<FakeReply>,
  options: { readChunk?: number; emptyPolls?: number } = {},
): FakeShelly {
  const { readChunk = 20, emptyPolls = 0 } = options;
  const fake: FakeShelly = { channel: undefined as unknown as RpcChannel, requests: [], frames: [], writes: [] };
  let expected = 0;
  let received: number[] = [];
  // Like mOS: a reply stays on RX control until it has been read out completely.
  const outbox: Uint8Array[] = [];
  let late: Uint8Array | undefined;
  let readOffset = 0;
  let pollsLeft = 0;

  const encode = (id: number, reply: object) =>
    new TextEncoder().encode(JSON.stringify({ id, src: 'shelly', ...reply }));

  const finishRequest = async () => {
    const frame = new TextDecoder().decode(new Uint8Array(received));
    received = [];
    fake.frames.push(frame);
    const request = JSON.parse(frame) as FakeRequest;
    fake.requests.push(request);
    const reply = await handler(request);
    if (late) outbox.push(late);
    late = undefined;
    if (reply === 'silence') return;
    if ('late' in reply) {
      late = encode(request.id, reply.late);
      return;
    }
    outbox.push(encode(request.id, reply));
    pollsLeft = emptyPolls;
  };

  fake.channel = {
    txControl: {
      async writeValue(value) {
        fake.writes.push({ target: 'tx', bytes: value.length });
        expected = view(value).getUint32(0, false);
        received = [];
      },
      readValue: () => Promise.reject(new Error('tx control is write-only')),
    },
    data: {
      async writeValue(value) {
        fake.writes.push({ target: 'data', bytes: value.length });
        received.push(...value);
        // A real device takes exactly the announced length; more is a framing bug.
        if (received.length > expected) throw new Error(`frame longer than announced (${expected} bytes)`);
        if (received.length === expected) await finishRequest();
      },
      async readValue() {
        const current = outbox[0] ?? new Uint8Array(0);
        const chunk = current.subarray(readOffset, readOffset + readChunk);
        readOffset += chunk.length;
        if (current.length > 0 && readOffset >= current.length) {
          outbox.shift();
          readOffset = 0;
        }
        return view(new Uint8Array(chunk));
      },
    },
    rxControl: {
      writeValue: () => Promise.reject(new Error('rx control is read-only')),
      async readValue() {
        const bytes = new Uint8Array(4);
        if (pollsLeft > 0) {
          pollsLeft--;
        } else {
          view(bytes).setUint32(0, outbox[0]?.length ?? 0, false);
        }
        return view(bytes);
      },
    },
  };
  return fake;
}

/** What a protected Shelly checks: a SHA-256 digest `auth` object built from the stored ha1. */
export async function verifyDigest(auth: Record<string, unknown> | undefined, ha1: string): Promise<boolean> {
  if (!auth) return false;
  const ha2 = await sha256Hex('dummy_method:dummy_uri');
  const expectedResponse = await sha256Hex(`${ha1}:${auth.nonce}:${auth.nc}:${auth.cnonce}:auth:${ha2}`);
  return auth.response === expectedResponse && auth.algorithm === 'SHA-256';
}

export function challengeError(realm: string, nonce = 1700000000): FakeReply {
  return {
    error: { code: 401, message: JSON.stringify({ auth_type: 'digest', nonce, nc: 1, realm, algorithm: 'SHA-256' }) },
  };
}
