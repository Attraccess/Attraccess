import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { webcrypto } from 'crypto';
import Redis from 'ioredis';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { WebSocket, WebSocketServer } from 'ws';
import { ClusterService } from '../../cluster/cluster.service';
import { EnrollmentLimitsService } from '../../device-enrollment/enrollment-limits.service';
import { EnrollmentRateLimitedException } from '../../device-enrollment/enrollment-rate-limited.exception';
import { ClusterPairingService } from './cluster-pairing.service';
import { PairingService } from './pairing.service';
import { deriveCode } from './pairing-protocol';
import { PAIRING_SUBPROTOCOL } from './session-framing';

jest.setTimeout(90_000);

const FAST = { heartbeatEveryMs: 200, sweepEveryMs: 200, deadlineSweepEveryMs: 50 };
const actor = { userId: 1, authenticationMethod: 'session' as const };
const firmware = { name: 'attractap', variant: 'touch', version: '1.8.0' };

async function waitFor(condition: () => Promise<boolean> | boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function p256Spki(): Promise<Buffer> {
  const keys = (await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  return Buffer.from(await webcrypto.subtle.exportKey('spki', keys.publicKey as unknown as webcrypto.CryptoKey));
}

/** A reader on a pairing socket: says hello, completes the first round and keeps what the server sends. */
class Reader {
  readonly messages: Array<Record<string, unknown>> = [];
  readonly ws: WebSocket;
  constructor(url: string) {
    this.ws = new WebSocket(url, PAIRING_SUBPROTOCOL);
    this.ws.on('message', (data: Buffer) => this.messages.push(JSON.parse(data.toString())));
    this.ws.on('error', () => undefined);
  }
  async next(type: string): Promise<Record<string, unknown>> {
    let found: Record<string, unknown> | undefined;
    await waitFor(() => (found = this.messages.find((m) => m['type'] === type)) !== undefined);
    this.messages.splice(this.messages.indexOf(found as Record<string, unknown>), 1);
    return found as Record<string, unknown>;
  }
  /** The code the reader shows. */
  async pair(): Promise<string> {
    await new Promise<void>((resolve) => this.ws.once('open', () => resolve()));
    const publicKey = await p256Spki();
    this.ws.send(
      JSON.stringify({ type: 'hello', v: 1, kind: 'touch', publicKey: publicKey.toString('base64'), firmware }),
    );
    const round = await this.next('round');
    const readerNonce = Buffer.alloc(16, 9);
    this.ws.send(JSON.stringify({ type: 'nonce', round: round['round'], nonce: readerNonce.toString('base64') }));
    const reveal = await this.next('reveal');
    return deriveCode(
      publicKey,
      Buffer.from(round['serverPublicKey'] as string, 'base64'),
      readerNonce,
      Buffer.from(reveal['serverNonce'] as string, 'base64'),
    ).code;
  }
}

/** Reader pairing with the reader on instance A and the admin on instance B, against a real Valkey (ATT-1163). */
describe('reader pairing across API instances', () => {
  let container: StartedTestContainer;
  let caSpki: Buffer;
  const closers: Array<() => Promise<void> | void> = [];
  /** The database both instances share. */
  const readers = new Map<number, Record<string, unknown>>();

  beforeAll(async () => {
    container = await new GenericContainer('valkey/valkey:9-alpine').withExposedPorts(6379).start();
    caSpki = await p256Spki();
  });

  afterEach(async () => {
    for (const close of closers.splice(0).reverse()) await close();
    readers.clear();
    const admin = new Redis(container.getMappedPort(6379), container.getHost());
    await admin.flushall();
    admin.disconnect();
  });

  afterAll(async () => {
    await container?.stop();
  });

  async function instance(name: string) {
    const valkey = new Redis(container.getMappedPort(6379), container.getHost());
    const cluster = new ClusterService(valkey, { instanceName: name, timing: FAST });
    cluster.onModuleInit();
    await cluster.whenReady();
    const limits = new EnrollmentLimitsService(cluster);
    let nextId = readers.size + 1;
    const pairing = new PairingService(
      {
        findReaderById: async (id: number) => readers.get(id),
        createNewReader: async () => {
          const reader = { id: nextId++, name: 'abcd', pairingState: 'revoked' };
          readers.set(reader.id, reader);
          return reader;
        },
        deleteReader: async (id: number) => readers.delete(id),
        updateReader: async (id: number, update: Record<string, unknown>) =>
          Object.assign(readers.get(id) ?? {}, update),
      } as never,
      {
        getCaPublicKeySpki: async () => caSpki,
        issueReaderCertificate: async () => ({ pem: 'CERT', serial: '01', notAfter: new Date(Date.now() + 1e9) }),
      } as never,
      {
        findPairedReaderByFingerprint: async () => null,
        markPaired: async (input: { readerId: number; fingerprint: string }) => {
          Object.assign(readers.get(input.readerId) ?? {}, {
            pairingState: 'paired',
            credentialFingerprint: input.fingerprint,
          });
          return { previousFingerprint: null, before: {} };
        },
      } as never,
      { record: async () => undefined } as never,
      { emit: () => true } as never,
      limits,
      { getUrl: async () => null } as never,
      { get: () => undefined } as never,
    );
    const pairings = new ClusterPairingService(pairing, limits, cluster);
    const http: Server = createServer();
    const wss = new WebSocketServer({ server: http, handleProtocols: () => PAIRING_SUBPROTOCOL });
    wss.on('connection', (ws, req) => pairing.handleConnection(ws, req));
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    closers.push(async () => {
      pairing.onApplicationShutdown();
      wss.clients.forEach((ws) => ws.terminate());
      wss.close();
      await new Promise((resolve) => http.close(resolve));
      await cluster.onApplicationShutdown();
      valkey.disconnect();
    });
    const reader = () => {
      const created = new Reader(`ws://127.0.0.1:${(http.address() as AddressInfo).port}/`);
      closers.push(() => created.ws.terminate());
      return created;
    };
    return { cluster, pairing, pairings, reader };
  }

  it('lists, resolves, gets and approves on B a reader that waits on A', async () => {
    const a = await instance('a');
    const b = await instance('b');
    const reader = a.reader();
    const code = await reader.pair();

    const [waiting] = await b.pairings.list();
    expect(waiting).toMatchObject({ state: 'waiting', kind: 'touch' });
    expect(waiting.createdAt).toBeInstanceOf(Date);
    expect(a.pairing.list()).toHaveLength(1);
    expect(b.pairing.list()).toHaveLength(0);

    expect((await b.pairings.resolve(code, actor)).id).toBe(waiting.id);
    expect((await b.pairings.get(waiting.id)).state).toBe('waiting');

    const done = await b.pairings.approve(waiting.id, { code, mode: 'new', name: 'Laser' }, actor);
    expect(done).toMatchObject({ id: waiting.id, state: 'completed' });
    await reader.next('accepted');
    expect(readers.get(done.targetReaderId as number)).toMatchObject({ name: 'Laser', pairingState: 'paired' });
    expect(await b.pairings.list()).toEqual([]);
  });

  it('cancels on B a reader that waits on A', async () => {
    const a = await instance('a');
    const b = await instance('b');
    const reader = a.reader();
    await reader.pair();
    const [waiting] = await b.pairings.list();

    await b.pairings.cancel(waiting.id, actor);
    expect((await reader.next('failed'))['reason']).toBe('cancelled-by-admin');
    expect(a.pairing.get(waiting.id)).toMatchObject({ state: 'cancelled' });
  });

  it('refuses on B a code shown by another reader, and asks to wait for a code readers on A and B both show', async () => {
    const a = await instance('a');
    const b = await instance('b');
    const onA = await a.reader().pair();
    await b.reader().pair();
    const listed = await b.pairings.list();
    expect(listed).toHaveLength(2);
    const onB = b.pairing.list()[0];
    await expect(b.pairings.approve(onB.id, { code: onA, mode: 'new' }, actor)).rejects.toThrow('PairingCodeNotFound');

    // Forced collision: the reader on B shows the same code as the one on A.
    const requestOnB = (b.pairing as unknown as { requests: Map<string, { current: { derived: unknown } }> }).requests;
    const requestOnA = (a.pairing as unknown as { requests: Map<string, { current: { derived: unknown } }> }).requests;
    [...requestOnB.values()][0].current.derived = [...requestOnA.values()][0].current.derived;
    await expect(a.pairings.resolve(onA, actor)).rejects.toThrow('PairingCodeAmbiguous');
    await expect(a.pairings.approve(onB.id, { code: onA, mode: 'new' }, actor)).rejects.toThrow('PairingCodeAmbiguous');
    expect(readers.size).toBe(0);
  });

  it('counts wrong codes across instances', async () => {
    const a = await instance('a');
    const b = await instance('b');
    const code = await a.reader().pair();
    for (let i = 0; i < 3; i++)
      await expect(a.pairings.resolve('AAAAAA', actor)).rejects.toThrow('PairingCodeNotFound');
    for (let i = 0; i < 2; i++)
      await expect(b.pairings.resolve('AAAAAA', actor)).rejects.toThrow('PairingCodeNotFound');

    const refused = await b.pairings.resolve(code, actor).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(EnrollmentRateLimitedException);
    expect((refused as EnrollmentRateLimitedException).retryAfterSeconds).toBeGreaterThan(0);
    expect((refused as EnrollmentRateLimitedException).retryAfterSeconds).toBeLessThanOrEqual(60);
    const [waiting] = await b.pairings.list();
    await expect(b.pairings.approve(waiting.id, { code, mode: 'new' }, actor)).rejects.toBeInstanceOf(
      EnrollmentRateLimitedException,
    );
    // Another approver is not affected.
    expect((await a.pairings.resolve(code, { ...actor, userId: 2 })).id).toBe(waiting.id);
  });

  it('lets a burst of parallel guesses on both instances test no more codes than the limit', async () => {
    const a = await instance('a');
    const b = await instance('b');
    const code = await a.reader().pair();
    const tries = await Promise.allSettled(
      Array.from({ length: 12 }, (_, index) => (index % 2 ? a : b).pairings.resolve('AAAAAA', actor)),
    );
    const reasons = tries.map((attempt) => (attempt as PromiseRejectedResult).reason as Error);
    expect(reasons.filter((reason) => reason.message === 'PairingCodeNotFound')).toHaveLength(5);
    expect(reasons.filter((reason) => reason instanceof EnrollmentRateLimitedException)).toHaveLength(7);
    // The right code is refused as well until the window ends.
    await expect(b.pairings.resolve(code, actor)).rejects.toBeInstanceOf(EnrollmentRateLimitedException);
  });

  it('takes approver attempts atomically: a wrong code keeps its attempt, anything else hands it back', async () => {
    const { cluster } = await instance('a');
    const limits = new EnrollmentLimitsService(cluster);
    const parallel = async (count: number) => {
      const results = await Promise.allSettled(Array.from({ length: count }, () => limits.beginApproverAttempt(7)));
      for (const result of results) {
        if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(EnrollmentRateLimitedException);
      }
      return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    };

    const taken = await parallel(8);
    expect(taken).toHaveLength(5);
    const refused = await limits.beginApproverAttempt(7).catch((error: EnrollmentRateLimitedException) => error);
    expect((refused as EnrollmentRateLimitedException).retryAfterSeconds).toBeGreaterThan(0);
    expect((refused as EnrollmentRateLimitedException).retryAfterSeconds).toBeLessThanOrEqual(60);

    await taken[0].notWrong();
    await taken[1].notWrong();
    await taken[2].wrong();
    expect(await parallel(4)).toHaveLength(2);
    // Another approver has their own limit.
    await expect(limits.beginApproverAttempt(8)).resolves.toEqual(
      expect.objectContaining({ wrong: expect.any(Function), notWrong: expect.any(Function) }),
    );
  });

  it('answers not found for a reader whose instance is gone', async () => {
    const a = await instance('a');
    const b = await instance('b');
    await a.reader().pair();
    const [waiting] = await b.pairings.list();
    a.cluster.halt();
    await waitFor(async () => !(await b.cluster.instances.isAlive(a.cluster.instanceId)), 20_000);
    await expect(b.pairings.get(waiting.id)).rejects.toThrow('Pairing not found');
    expect(await b.pairings.list()).toEqual([]);
  });
});
