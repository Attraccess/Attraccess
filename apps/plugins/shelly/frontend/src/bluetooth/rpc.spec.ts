// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildRpcAuth, computeHa1, parseChallenge } from './digest';
import { RpcError, ShellyBleError } from './errors';
import { challengeError, createFakeShelly, verifyDigest } from './fakeShelly';
import { ShellyBleRpc } from './rpc';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

function rpcFor(fake: ReturnType<typeof createFakeShelly>, extra: ConstructorParameters<typeof ShellyBleRpc>[1] = {}) {
  return new ShellyBleRpc(fake.channel, { sleep: async () => undefined, ...extra });
}

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
    const challenge = { realm: 'shellypro1pm-a0b1c2d3e4f5', nonce: 1700000000, nc: 1 };
    const auth = await buildRpcAuth(challenge, 'admin', 'secret', 12345, 1);

    const ha1 = sha('admin:shellypro1pm-a0b1c2d3e4f5:secret');
    const ha2 = sha('dummy_method:dummy_uri');
    expect(auth).toEqual({
      realm: 'shellypro1pm-a0b1c2d3e4f5',
      username: 'admin',
      nonce: 1700000000,
      cnonce: 12345,
      nc: 1,
      algorithm: 'SHA-256',
      response: sha(`${ha1}:1700000000:1:12345:auth:${ha2}`),
    });
    expect(await computeHa1('admin', 'shellypro1pm-a0b1c2d3e4f5', 'secret')).toBe(ha1);
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
