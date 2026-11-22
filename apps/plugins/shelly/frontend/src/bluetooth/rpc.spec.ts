// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildRpcAuth, computeHa1, parseChallenge } from './digest';
import { RpcError, ShellyBleError } from './errors';
import { challengeError, createFakeShelly, verifyDigest, type FakeRequest } from './fakeShelly.test-utils';
import type { RpcChannel } from './gatt';
import { ShellyBleRpc } from './rpc';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

/** A fake clock that only moves when the client sleeps, so a silent device never spins in real time. */
function rpcFor(fake: { channel: RpcChannel }, extra: ConstructorParameters<typeof ShellyBleRpc>[1] = {}) {
  let clock = 0;
  return new ShellyBleRpc(fake.channel, {
    now: () => clock,
    sleep: async (ms) => void (clock += ms),
    ...extra,
  });
}

/** A channel that answers every request with `length` on RX control and `chunks` from the data char. */
function rawChannel(length: number, chunks: Array<Uint8Array | Error>): { channel: RpcChannel } {
  const rx = new Uint8Array(4);
  new DataView(rx.buffer).setUint32(0, length, false);
  let next = 0;
  const ok = async () => undefined;
  return {
    channel: {
      txControl: { writeValue: ok, readValue: () => Promise.reject(new Error('write-only')) },
      rxControl: { writeValue: ok, readValue: async () => new DataView(rx.buffer) },
      data: {
        writeValue: ok,
        async readValue() {
          const chunk = chunks[next++] ?? new Uint8Array(0);
          if (chunk instanceof Error) throw chunk;
          return new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        },
      },
    },
  };
}

const bytes = (text: string) => new TextEncoder().encode(text);

describe('ShellyBleRpc framing', () => {
  it('writes the length to TX control, then the body in 20-byte chunks', async () => {
    const fake = createFakeShelly(() => ({ result: { ok: true } }));
    await rpcFor(fake).call('Shelly.GetDeviceInfo', { a: 'x'.repeat(50) });

    const frameLength = new TextEncoder().encode(fake.frames[0]).length;
    expect(fake.writes[0]).toEqual({ target: 'tx', bytes: 4 });
    const dataWrites = fake.writes.slice(1);
    expect(dataWrites.every((w) => w.target === 'data' && w.bytes <= 20)).toBe(true);
    expect(dataWrites.reduce((sum, w) => sum + w.bytes, 0)).toBe(frameLength);
    expect(dataWrites.length).toBe(Math.ceil(frameLength / 20));
  });

  it('reassembles a response that arrives in many small reads', async () => {
    const results = Array.from({ length: 40 }, (_, i) => ({ ssid: `net-${i}`, rssi: -i - 1 }));
    const fake = createFakeShelly(() => ({ result: { results } }), { readChunk: 7, emptyPolls: 3 });
    const reply = await rpcFor(fake).call<{ results: unknown[] }>('WiFi.Scan');
    expect(reply.results).toEqual(results);
  });

  it('announces the byte length, not the character length, for non-ASCII text', async () => {
    const fake = createFakeShelly((req) => ({ result: req.params }));
    const params = { config: { sta: { ssid: 'Büro-WLAN ☕', pass: 'äöü-ß' } } };
    await expect(rpcFor(fake).call('WiFi.SetConfig', params)).resolves.toEqual(params);
    expect(fake.requests[0].params).toEqual(params);
  });

  it('prefers writeValueWithResponse when the browser has it', async () => {
    const fake = createFakeShelly(() => ({ result: null }));
    const acked: string[] = [];
    for (const key of ['txControl', 'data'] as const) {
      const characteristic = fake.channel[key];
      characteristic.writeValueWithResponse = (value) => {
        acked.push(key);
        return characteristic.writeValue(value);
      };
    }
    await rpcFor(fake).call('X');
    expect(acked[0]).toBe('txControl');
    expect(acked.filter((k) => k === 'data').length).toBeGreaterThan(0);
  });

  it('increments the request id per call and identifies itself', async () => {
    const fake = createFakeShelly(() => ({ result: null }));
    const rpc = rpcFor(fake);
    await rpc.call('A');
    await rpc.call('B', { x: 1 });
    expect(fake.requests.map((r) => r.id)).toEqual([1, 2]);
    expect(fake.requests[1]).toMatchObject({ method: 'B', params: { x: 1 }, src: 'attraccess' });
  });

  it('runs concurrent calls one after another so their frames never interleave', async () => {
    const fake = createFakeShelly((req) => ({ result: { method: req.method } }));
    const rpc = rpcFor(fake);
    const replies = await Promise.all([
      rpc.call('WiFi.Scan', { pad: 'x'.repeat(60) }),
      rpc.call('WiFi.Scan', { pad: 'y'.repeat(60) }),
      rpc.call('Shelly.GetDeviceInfo'),
    ]);
    expect(replies).toEqual([{ method: 'WiFi.Scan' }, { method: 'WiFi.Scan' }, { method: 'Shelly.GetDeviceInfo' }]);
    expect(fake.requests.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('keeps serving calls after one fails', async () => {
    const fake = createFakeShelly((req) =>
      req.method === 'Bad' ? { error: { code: -1, message: 'no' } } : { result: 1 },
    );
    const rpc = rpcFor(fake);
    const [bad, good] = await Promise.allSettled([rpc.call('Bad'), rpc.call('Good')]);
    expect(bad.status).toBe('rejected');
    expect(good).toEqual({ status: 'fulfilled', value: 1 });
  });

  it('times out when the device never answers', async () => {
    const fake = createFakeShelly(() => 'silence');
    let clock = 0;
    const rpc = rpcFor(fake, { timeoutMs: 1_000, now: () => clock, sleep: async (ms) => void (clock += ms) });
    await expect(rpc.call('Shelly.GetDeviceInfo')).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('skips a late reply to a call that timed out and returns its own', async () => {
    const fake = createFakeShelly((req) =>
      req.method === 'WiFi.Scan' ? { late: { result: { results: ['late'] } } } : { result: { method: req.method } },
    );
    const rpc = rpcFor(fake, { timeoutMs: 1_000 });
    await expect(rpc.call('WiFi.Scan')).rejects.toMatchObject({ kind: 'timeout' });
    // The scan's reply now sits in front of SetAuth's: it must not count as SetAuth's answer.
    await expect(rpc.call('Shelly.SetAuth')).resolves.toEqual({ method: 'Shelly.SetAuth' });
    await expect(rpc.call('WiFi.SetConfig')).resolves.toEqual({ method: 'WiFi.SetConfig' });
  });

  it('rejects a reply that is not JSON', async () => {
    const reply = bytes('not json');
    await expect(rpcFor(rawChannel(reply.length, [reply])).call('X')).rejects.toMatchObject({
      kind: 'malformedResponse',
    });
  });

  it('refuses a reply larger than 1 MB before reading it', async () => {
    await expect(rpcFor(rawChannel(2 * 1024 * 1024, [])).call('X')).rejects.toMatchObject({
      kind: 'responseTooLarge',
    });
  });

  it('reports a lost link when the device stops sending mid-reply', async () => {
    const reply = bytes('{"id":1,"result":{"long":"' + 'x'.repeat(40) + '"}}');
    const channel = rawChannel(reply.length, [reply.subarray(0, 20)]);
    await expect(rpcFor(channel).call('X')).rejects.toMatchObject({ kind: 'linkLost' });
  });

  it('reports a lost link when a read fails mid-reply', async () => {
    const reply = bytes('{"id":1,"result":{"long":"' + 'x'.repeat(40) + '"}}');
    const channel = rawChannel(reply.length, [reply.subarray(0, 20), new Error('GATT Server is disconnected')]);
    await expect(rpcFor(channel).call('X')).rejects.toMatchObject({ kind: 'linkLost' });
  });

  it('times out a reply that trickles in past the deadline', async () => {
    const reply = bytes('{"id":1,"result":"' + 'x'.repeat(200) + '"}');
    const chunks = Array.from({ length: reply.length }, (_, i) => reply.subarray(i, i + 1));
    let clock = 0;
    const rpc = new ShellyBleRpc(rawChannel(reply.length, chunks).channel, {
      timeoutMs: 1_000,
      now: () => (clock += 50),
      sleep: async () => undefined,
    });
    await expect(rpc.call('X')).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('turns a failing characteristic into a link-lost error', async () => {
    const fake = createFakeShelly(() => ({ result: null }));
    fake.channel.data.writeValue = () => Promise.reject(new Error('GATT Server is disconnected'));
    await expect(rpcFor(fake).call('X')).rejects.toMatchObject({ kind: 'linkLost' });
  });

  it('propagates an RPC error with method, code and device message only', async () => {
    const fake = createFakeShelly(() => ({ error: { code: -103, message: 'Invalid argument' } }));
    const err = await rpcFor(fake)
      .call('WiFi.SetConfig', { config: { sta: { pass: 'hunter2-wifi' } } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcError);
    expect((err as RpcError).message).toBe('WiFi.SetConfig failed: Invalid argument (code -103)');
    expect(JSON.stringify(err)).not.toContain('hunter2-wifi');
  });
});

describe('digest auth', () => {
  it('matches a known SHA-256 vector', async () => {
    // Literal values, computed outside this code base with sha256sum:
    //   ha1      = sha256("admin:shellypro1pm-a0b1c2d3e4f5:secret")
    //   ha2      = sha256("dummy_method:dummy_uri")
    //   response = sha256("<ha1>:1700000000:1:12345:auth:<ha2>")
    const challenge = { realm: 'shellypro1pm-a0b1c2d3e4f5', nonce: 1700000000, nc: 1 };
    const auth = await buildRpcAuth(challenge, 'admin', 'secret', 12345, 1);

    expect(auth).toEqual({
      realm: 'shellypro1pm-a0b1c2d3e4f5',
      username: 'admin',
      nonce: 1700000000,
      cnonce: 12345,
      nc: 1,
      algorithm: 'SHA-256',
      response: '9422c1e883192fc888074fcd4822a51f6b48905356f8d1404a5688828ab3b2df',
    });
    expect(await computeHa1('admin', 'shellypro1pm-a0b1c2d3e4f5', 'secret')).toBe(
      '9b39ccfc2f6ac34c6e7e449de05a0ac893ea043c2bb2587df3fbd942bae78c50',
    );
  });

  it('uses a random cnonce per auth object', async () => {
    const challenge = { realm: 'r', nonce: 1 };
    const a = await buildRpcAuth(challenge, 'admin', 'pw');
    const b = await buildRpcAuth(challenge, 'admin', 'pw');
    expect(Number.isInteger(a.cnonce)).toBe(true);
    expect(a.cnonce).not.toBe(b.cnonce);
  });

  it('parses a challenge and rejects other 401 messages', () => {
    expect(parseChallenge('{"auth_type":"digest","nonce":5,"nc":1,"realm":"r","algorithm":"SHA-256"}')).toMatchObject({
      realm: 'r',
      nonce: 5,
    });
    expect(parseChallenge('nope')).toBeUndefined();
    expect(parseChallenge(undefined)).toBeUndefined();
  });

  it('answers a 401 challenge by replaying the call with an auth object', async () => {
    const ha1 = sha('admin:dev-1:pw');
    const fake = createFakeShelly(async (req) =>
      (await verifyDigest(req.auth, ha1)) ? { result: { done: true } } : challengeError('dev-1'),
    );
    const rpc = rpcFor(fake);
    rpc.setCredentials('admin', 'pw');

    await expect(rpc.call('Sys.GetConfig')).resolves.toEqual({ done: true });
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[0].auth).toBeUndefined();
    expect(fake.requests[1].auth).toMatchObject({ realm: 'dev-1', username: 'admin', algorithm: 'SHA-256' });

    // The next call reuses the challenge: one round trip.
    await rpc.call('Sys.GetConfig');
    expect(fake.requests).toHaveLength(3);
    expect(fake.requests[2].auth?.nc).toBe(2);
  });

  it('retries once with a fresh challenge when the reused nonce went stale', async () => {
    const ha1 = sha('admin:dev-1:pw');
    let nonce = 100;
    const valid = new Set<number>();
    const fake = createFakeShelly(async (req: FakeRequest) => {
      const auth = req.auth as { nonce?: number } | undefined;
      if (auth && valid.has(Number(auth.nonce)) && (await verifyDigest(req.auth, ha1))) {
        valid.delete(Number(auth.nonce)); // each nonce is good for one call, like one that expires
        return { result: { ok: true } };
      }
      nonce += 1;
      valid.add(nonce);
      return challengeError('dev-1', nonce);
    });
    const rpc = rpcFor(fake);
    rpc.setCredentials('admin', 'pw');

    await expect(rpc.call('A')).resolves.toEqual({ ok: true });
    await expect(rpc.call('B')).resolves.toEqual({ ok: true });
    // B: the stale nonce is refused once, then the fresh challenge succeeds.
    expect(fake.requests.map((r) => r.method)).toEqual(['A', 'A', 'B', 'B']);
    expect(fake.requests[3].auth).toMatchObject({ nonce: 102, nc: 1 });
  });

  it('reports a wrong password without echoing it', async () => {
    const fake = createFakeShelly(async (req) =>
      (await verifyDigest(req.auth, sha('admin:dev-1:right'))) ? { result: null } : challengeError('dev-1'),
    );
    const rpc = rpcFor(fake);
    rpc.setCredentials('admin', 'wrong-secret-pw');
    const err = await rpc.call('Sys.GetConfig').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShellyBleError);
    expect(err).toMatchObject({ kind: 'wrongPassword' });
    expect(String((err as Error).message) + JSON.stringify(err)).not.toContain('wrong-secret-pw');
  });

  it('asks for the password when the device wants one and none is set', async () => {
    const fake = createFakeShelly(() => challengeError('dev-1'));
    await expect(rpcFor(fake).call('Sys.GetConfig')).rejects.toMatchObject({ kind: 'authRequired' });
  });
});
