import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { ECDH, webcrypto } from 'crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { PairingService } from './pairing.service';
import { commitmentMatches, deriveCode } from './pairing-protocol';
import { EnrollmentLimitsService } from '../../device-enrollment/enrollment-limits.service';
import { EnrollmentRateLimitedException } from '../../device-enrollment/enrollment-rate-limited.exception';
import { PAIRING_SUBPROTOCOL } from './session-framing';

const actor = { userId: 1, authenticationMethod: 'session' as const };

async function readerKey() {
  const keys = (await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  return Buffer.from(await webcrypto.subtle.exportKey('spki', keys.publicKey as unknown as webcrypto.CryptoKey));
}

class PairingClient {
  public readonly messages: Array<Record<string, unknown>> = [];
  public readonly ws: WebSocket;
  public constructor(url: string, headers: Record<string, string> = {}) {
    this.ws = new WebSocket(url, PAIRING_SUBPROTOCOL, { headers });
    this.ws.on('message', (data: Buffer) => this.messages.push(JSON.parse(data.toString())));
    this.ws.on('error', () => undefined);
  }
  public opened() {
    return new Promise<void>((resolve) => this.ws.once('open', () => resolve()));
  }
  public send(message: Record<string, unknown>) {
    this.ws.send(JSON.stringify(message));
  }
  public async next(type: string) {
    for (let i = 0; i < 100; i++) {
      const index = this.messages.findIndex((m) => m['type'] === type);
      if (index >= 0) return this.messages.splice(index, 1)[0];
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`no ${type} message`);
  }
}

describe('PairingService', () => {
  let http: Server;
  let wss: WebSocketServer;
  let url: string;
  let service: PairingService;
  let limits: EnrollmentLimitsService;
  let caSpki: Buffer;
  const readers = new Map<number, Record<string, unknown>>();
  const credentialEvents: Array<Record<string, unknown>> = [];
  const audited: Array<Record<string, unknown>> = [];
  const emitted: unknown[] = [];
  const clients: PairingClient[] = [];
  let nextId = 1;
  let appUrl: string | null = 'https://attraccess.example';
  let registry: Record<string, unknown>;

  beforeAll(async () => {
    caSpki = await readerKey();
    http = createServer();
    wss = new WebSocketServer({ server: http, handleProtocols: () => PAIRING_SUBPROTOCOL });
    wss.on('connection', (ws, req) => service.handleConnection(ws, req));
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    url = `ws://127.0.0.1:${(http.address() as AddressInfo).port}/`;
  });

  beforeEach(() => {
    readers.clear();
    credentialEvents.length = 0;
    audited.length = 0;
    emitted.length = 0;
    nextId = 1;
    appUrl = 'https://attraccess.example';
    const attractap = {
      findReaderById: async (id: number) => readers.get(id),
      createNewReader: async () => {
        const reader = {
          id: nextId++,
          name: 'abcd',
          pairingState: 'unpaired',
          apiTokenHash: 'hash',
          credentialFingerprint: null,
          certificateSerial: null,
        };
        readers.set(reader.id, reader);
        return { reader, token: 't' };
      },
      deleteReader: async (id: number) => readers.delete(id),
      updateReader: async (id: number, update: Record<string, unknown>) => Object.assign(readers.get(id) ?? {}, update),
    };
    const identity = {
      getCaPublicKeySpki: async () => caSpki,
      issueReaderCertificate: async () => ({ pem: 'CERT', serial: '01', notAfter: new Date(Date.now() + 1e9) }),
    };
    // A faithful in-memory stand-in for the registry's transactional writes.
    registry = {
      invalidate: jest.fn(),
      isActive: async (id: number, fingerprint: string) =>
        readers.get(id)?.['pairingState'] === 'paired' && readers.get(id)?.['credentialFingerprint'] === fingerprint,
      findPairedReaderByFingerprint: async (fingerprint: string) =>
        [...readers.values()].find(
          (r) => r['pairingState'] === 'paired' && r['credentialFingerprint'] === fingerprint,
        )?.['id'] ?? null,
      recordCertificate: jest.fn(async (id: number, _fingerprint: string, c: { serial: string }) =>
        Object.assign(readers.get(id) ?? {}, { certificateSerial: c.serial }),
      ),
      markPaired: async (input: {
        readerId: number;
        fingerprint: string;
        certificate: { serial: string };
        actorId: number;
        previousCredentialBecomes: string;
      }) => {
        const reader = readers.get(input.readerId) as Record<string, unknown>;
        const { fingerprint } = input;
        const previous =
          reader['pairingState'] === 'paired' && reader['credentialFingerprint'] !== fingerprint
            ? (reader['credentialFingerprint'] as string)
            : null;
        if (previous) {
          credentialEvents.push({
            readerId: reader['id'],
            keyFingerprint: previous,
            certificateSerial: reader['certificateSerial'],
            state: input.previousCredentialBecomes,
          });
        }
        Object.assign(reader, {
          pairingState: 'paired',
          credentialFingerprint: fingerprint,
          certificateSerial: input.certificate.serial,
          apiTokenHash: '',
        });
        credentialEvents.push({ readerId: reader['id'], keyFingerprint: fingerprint, state: 'paired' });
        return { previousFingerprint: previous };
      },
      revoke: async (id: number) => {
        const reader = readers.get(id);
        if (!reader || reader['pairingState'] !== 'paired') throw new Error('Reader is not paired');
        credentialEvents.push({ readerId: id, keyFingerprint: reader['credentialFingerprint'], state: 'revoked' });
        Object.assign(reader, { pairingState: 'revoked' });
      },
    };
    limits = new EnrollmentLimitsService();
    service = new PairingService(
      attractap as never,
      identity as never,
      registry as never,
      { recordAttractap: async (event: Record<string, unknown>) => void audited.push(event) } as never,
      { emit: (_e: string, id: unknown) => emitted.push(id) } as never,
      limits,
      { getUrl: async () => appUrl } as never,
    );
  });

  afterEach(async () => {
    clients.splice(0).forEach((c) => c.ws.close());
    await new Promise((r) => setTimeout(r, 50)); // let close handlers (and their audit writes) finish
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    wss.close();
    await new Promise((resolve) => http.close(resolve));
  });

  const firmware = { name: 'attractap', variant: 'touch', version: '1.8.0' };

  /** A reader that follows the protocol: hello, round, nonce, reveal and its own derivation. */
  async function announce(extra: Record<string, unknown> = {}, kind: 'touch' | 'lite' = 'touch') {
    const publicKey = await readerKey();
    const client = new PairingClient(url);
    clients.push(client);
    await client.opened();
    client.send({ type: 'hello', v: 1, kind, publicKey: publicKey.toString('base64'), firmware, ...extra });
    return { client, publicKey, ...(await completeRound(client, publicKey)) };
  }

  async function completeRound(client: PairingClient, publicKey: Buffer) {
    const round = await client.next('round');
    const readerNonce = Buffer.alloc(16, 9);
    client.send({ type: 'nonce', round: round['round'], nonce: readerNonce.toString('base64') });
    const reveal = await client.next('reveal');
    const serverKey = Buffer.from(round['serverPublicKey'] as string, 'base64');
    const serverNonce = Buffer.from(reveal['serverNonce'] as string, 'base64');
    const checks = commitmentMatches(Buffer.from(round['commitment'] as string, 'base64'), serverKey, publicKey, serverNonce);
    const derived = deriveCode(publicKey, serverKey, readerNonce, serverNonce);
    return { round, reveal, checks, derived, code: derived.code };
  }

  const waitFor = async (predicate: () => boolean) => {
    for (let i = 0; i < 100 && !predicate(); i++) await new Promise((r) => setTimeout(r, 20));
  };

  const pendingOf = async () => {
    await waitFor(() => service.list().length >= 1);
    return service.list()[0];
  };

  it('enrolls and pairs a new touch reader with one approval of the code it shows', async () => {
    const { client, round, checks, code } = await announce();
    expect(checks).toBe(true);
    expect(round['appUrl']).toBe('https://attraccess.example');
    expect(round['rotatesInSeconds']).toBeLessThanOrEqual(30);
    expect(round['expiresInSeconds']).toBeLessThanOrEqual(600);

    const pending = await pendingOf();
    expect(JSON.stringify(pending)).not.toContain(code); // the list never shows a code
    expect(readers.size).toBe(0); // nothing is written before approval

    const resolved = service.resolve(code.toLowerCase().replace(/^(...)/, '$1-'), actor);
    expect(resolved.id).toBe(pending.id);

    const done = await service.approve(pending.id, { code, mode: 'new', name: 'Laser' }, actor);
    await client.next('accepted');
    expect(done.state).toBe('completed');
    expect(readers.size).toBe(1);
    expect(readers.get(done.targetReaderId as number)).toMatchObject({ name: 'Laser', pairingState: 'paired', apiTokenHash: '' });
    expect(credentialEvents).toEqual([expect.objectContaining({ state: 'paired' })]);
    expect(audited).toEqual([expect.objectContaining({ action: 'reader.enrolled', details: { method: 'code' } })]);
    expect(emitted).toEqual([done.targetReaderId]);
    expect(service.list()).toEqual([]);
  });

  it('records the flasher as the method when approving through it', async () => {
    const { code } = await announce();
    const pending = await pendingOf();
    await service.approve(pending.id, { code, mode: 'new', via: 'flasher' }, actor);
    expect(audited[0]).toMatchObject({ details: { method: 'flasher' } });
  });

  it('approves a Lite reader by the pattern round, and exposes the pattern only in the detail view', async () => {
    const { derived, round } = await announce({}, 'lite');
    const pending = await pendingOf();
    expect(pending).not.toHaveProperty('pattern');
    const detail = service.get(pending.id);
    expect(detail.pattern).toEqual(derived.pattern);
    expect(detail.round).toBe(round['round']);

    await service.approve(pending.id, { round: detail.round as number, mode: 'new' }, actor);
    expect(audited[0]).toMatchObject({ action: 'reader.enrolled', details: { method: 'led-pattern' } });
  });

  it('refuses a stale Lite round without counting it as a wrong code, and a touch reader without a code', async () => {
    await announce({}, 'lite');
    const pending = await pendingOf();
    for (let i = 0; i < 6; i++) {
      await expect(service.approve(pending.id, { round: 99, mode: 'new' }, actor)).rejects.toMatchObject({
        message: 'PairingRoundStale',
      });
    }
    expect(readers.size).toBe(0);

    await announce({}, 'touch');
    const touch = service.list().find((p) => p.kind === 'touch') as { id: string };
    await expect(service.approve(touch.id, { round: 1, mode: 'new' }, actor)).rejects.toThrow('CodeRequired');
  });

  it('accepts the previous round until the next rotation, then refuses it', async () => {
    const { client, publicKey, code: first } = await announce();
    const pending = await pendingOf();
    const internal = service as unknown as { rotate: (r: unknown) => Promise<void>; requests: Map<string, unknown> };
    const request = internal.requests.get(pending.id);

    await internal.rotate(request);
    const second = await completeRound(client, publicKey);
    expect(service.resolve(first, actor).id).toBe(pending.id); // previous round still valid
    expect(service.resolve(second.code, actor).id).toBe(pending.id);

    await internal.rotate(request);
    expect(() => service.resolve(first, actor)).toThrow('PairingCodeNotFound'); // dropped after the next rotation
    expect(service.resolve(second.code, actor).id).toBe(pending.id);
  });

  it('sends a new round every rotation with a fresh commitment', async () => {
    const { client, round } = await announce();
    const request = (service as unknown as { requests: Map<string, unknown> }).requests.values().next().value;
    await (service as unknown as { rotate: (r: unknown) => Promise<void> }).rotate(request);
    const next = await client.next('round');
    expect(next['round']).toBe((round['round'] as number) + 1);
    expect(next['commitment']).not.toBe(round['commitment']);
  });

  it('sends no appUrl when the setting is empty', async () => {
    appUrl = null;
    const { round } = await announce();
    expect(round['appUrl']).toBeNull();
  });

  it('cannot get a man in the middle key approved with the code the reader shows', async () => {
    const readerKeyPair = await readerKey();
    const attackerKey = await readerKey();
    const attacker = new PairingClient(url);
    clients.push(attacker);
    await attacker.opened();
    attacker.send({ type: 'hello', v: 1, kind: 'touch', publicKey: attackerKey.toString('base64'), firmware });
    const relayed = await completeRound(attacker, attackerKey);

    // The real reader derived its code from its own key and what the attacker relayed.
    const readerSide = deriveCode(
      readerKeyPair,
      Buffer.from(relayed.round['serverPublicKey'] as string, 'base64'),
      Buffer.alloc(16, 9),
      Buffer.from(relayed.reveal['serverNonce'] as string, 'base64'),
    );
    expect(readerSide.code).not.toBe(relayed.code);
    expect(() => service.resolve(readerSide.code, actor)).toThrow('PairingCodeNotFound');
  });

  it('refuses a code that belongs to another waiting reader and counts it', async () => {
    const a = await announce();
    await announce();
    const pending = service.list();
    expect(pending).toHaveLength(2);
    const other = pending.find((p) => service.get(p.id) && p.id !== service.resolve(a.code, actor).id) as { id: string };
    await expect(service.approve(other.id, { code: a.code, mode: 'new' }, actor)).rejects.toThrow('PairingCodeNotFound');
    expect(readers.size).toBe(0);
  });

  it('asks to wait when two readers show the same code, without counting a wrong code', async () => {
    await announce();
    await announce();
    const [first, second] = [...(service as unknown as { requests: Map<string, { current: { derived: unknown } }> }).requests.values()];
    first.current.derived = second.current.derived; // forced collision
    const code = (second.current.derived as { code: string }).code;
    for (let i = 0; i < 6; i++) expect(() => service.resolve(code, actor)).toThrow('PairingCodeAmbiguous');
    const id = service.list()[0].id;
    await expect(service.approve(id, { code, mode: 'new' }, actor)).rejects.toThrow('PairingCodeAmbiguous');
  });

  it('answers 429 after 5 wrong codes in a minute for resolve and approve alike', async () => {
    const { code } = await announce();
    const pending = await pendingOf();
    for (let i = 0; i < 3; i++) expect(() => service.resolve('AAAAAA', actor)).toThrow('PairingCodeNotFound');
    for (let i = 0; i < 2; i++) {
      await expect(service.approve(pending.id, { code: '222222', mode: 'new' }, actor)).rejects.toThrow('PairingCodeNotFound');
    }
    expect(() => service.resolve('AAAAAA', actor)).toThrow(EnrollmentRateLimitedException);
    await expect(service.approve(pending.id, { code, mode: 'new' }, actor)).rejects.toThrow(EnrollmentRateLimitedException);
    expect(readers.size).toBe(0);
    // another approver is not affected
    expect(service.resolve(code, { ...actor, userId: 2 }).id).toBe(pending.id);
  });

  it('lets only one of several concurrent approvals through', async () => {
    const { code } = await announce();
    const pending = await pendingOf();
    const results = await Promise.allSettled([
      service.approve(pending.id, { code, mode: 'new' }, actor),
      service.approve(pending.id, { code, mode: 'new' }, actor),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(readers.size).toBe(1);
  });

  it('binds a token reader through its one-time ticket and pairs its own record', async () => {
    readers.set(7, { id: 7, name: 'old', pairingState: 'unpaired', apiTokenHash: 'h', credentialFingerprint: null });
    nextId = 8;
    const ticket = service.issueBindingTicket(7);
    const { code } = await announce({ ticket });
    const pending = await pendingOf();
    expect(pending.boundReaderId).toBe(7);

    await expect(service.approve(pending.id, { code, mode: 'new' }, actor)).rejects.toThrow('already has a record');
    await service.approve(pending.id, { code, mode: 'pair' }, actor);
    expect(readers.get(7)).toMatchObject({ pairingState: 'paired', apiTokenHash: '' });
    expect(readers.size).toBe(1);
    expect(audited[0]).toMatchObject({ action: 'reader.pairing_confirmed', details: { mode: 'pair', method: 'code' } });
  });

  it('refuses an unknown or already used ticket instead of listing a new reader', async () => {
    readers.set(7, { id: 7, pairingState: 'unpaired' });
    const ticket = service.issueBindingTicket(7);
    await announce({ ticket });
    const client = new PairingClient(url);
    clients.push(client);
    await client.opened();
    client.send({
      type: 'hello', v: 1, kind: 'touch', publicKey: (await readerKey()).toString('base64'), firmware, ticket,
    });
    await new Promise<void>((resolve) => client.ws.once('close', () => resolve()));
    const bogus = new PairingClient(url);
    clients.push(bogus);
    await bogus.opened();
    bogus.send({ type: 'hello', v: 1, kind: 'touch', publicKey: (await readerKey()).toString('base64'), firmware, ticket: 'nope' });
    await new Promise<void>((resolve) => bogus.ws.once('close', () => resolve()));
    expect(service.list()).toHaveLength(1);
  });

  it('takes over an existing record and closes the old credential as replaced', async () => {
    readers.set(3, { id: 3, name: 'old', pairingState: 'paired', credentialFingerprint: 'old-fp', certificateSerial: '00' });
    const { code } = await announce();
    const pending = await pendingOf();
    await expect(service.approve(pending.id, { code, mode: 'takeover' }, actor)).rejects.toThrow('targetReaderId');
    await service.approve(pending.id, { code, mode: 'takeover', targetReaderId: 3 }, actor);
    expect(credentialEvents.map((e) => e['state'])).toEqual(['replaced', 'paired']);
    expect(audited.map((a) => a['action'])).toEqual(['reader.replaced', 'reader.pairing_confirmed']);
    expect(readers.size).toBe(1);
  });

  it('rolls a newly created record back when the commit fails', async () => {
    const { code } = await announce();
    const pending = await pendingOf();
    (registry['markPaired'] as unknown) = async () => {
      throw new Error('disk full');
    };
    await expect(service.approve(pending.id, { code, mode: 'new' }, actor)).rejects.toThrow('PairingFailed');
    expect(readers.size).toBe(0);
    expect(audited).toEqual([]);
  });

  it('creates nothing when the reader is already gone', async () => {
    const { client, code } = await announce();
    const pending = await pendingOf();
    client.ws.close();
    await new Promise((r) => setTimeout(r, 100));
    await expect(service.approve(pending.id, { code, mode: 'new' }, actor)).rejects.toBeDefined();
    expect(readers.size).toBe(0);
  });

  it('aborts when the reader cancels, and accepts a new request on the same connection', async () => {
    const { client, publicKey } = await announce();
    client.send({ type: 'cancel' });
    await waitFor(() => service.list().length === 0);
    client.send({ type: 'hello', v: 1, kind: 'touch', publicKey: publicKey.toString('base64'), firmware });
    await client.next('round');
    expect(service.list()).toHaveLength(1);
  });

  it('allows 3 attempts per connection per minute', async () => {
    const { client, publicKey } = await announce();
    for (let i = 0; i < 2; i++) {
      client.send({ type: 'cancel' });
      await waitFor(() => service.list().length === 0);
      client.send({ type: 'hello', v: 1, kind: 'touch', publicKey: publicKey.toString('base64'), firmware });
      await client.next('round');
    }
    client.send({ type: 'cancel' });
    await waitFor(() => service.list().length === 0);
    client.send({ type: 'hello', v: 1, kind: 'touch', publicKey: publicKey.toString('base64'), firmware });
    const failed = await client.next('failed');
    expect(failed['reason']).toBe('rate-limited');
  });

  it('ends a request after 10 minutes and tells the reader', async () => {
    const { client } = await announce();
    const request = (service as unknown as { requests: Map<string, unknown> }).requests.values().next().value;
    await (service as unknown as { expire: (r: unknown) => Promise<void> }).expire(request);
    expect((await client.next('failed'))['reason']).toBe('expired');
    expect(service.list()).toEqual([]);
  });

  it('limits per client address behind a trusted proxy, and per socket address without one', async () => {
    const admit = jest.spyOn(limits, 'admit');
    const hello = async (forwardedFor: string) => {
      const client = new PairingClient(url, { 'x-forwarded-for': forwardedFor });
      clients.push(client);
      await client.opened();
      client.send({ type: 'hello', v: 1, kind: 'touch', publicKey: (await readerKey()).toString('base64'), firmware });
      await client.next('round');
    };

    const previous = process.env.TRUST_PROXY;
    try {
      delete process.env.TRUST_PROXY;
      await hello('203.0.113.9');
      expect(admit).toHaveBeenLastCalledWith(expect.any(String), '127.0.0.1');

      process.env.TRUST_PROXY = 'loopback';
      await hello('203.0.113.9');
      expect(admit).toHaveBeenLastCalledWith(expect.any(String), '203.0.113.9');
    } finally {
      if (previous === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = previous;
    }
  });

  it('rejects a public key that is not in canonical uncompressed form', async () => {
    const keys = (await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const raw = Buffer.from(await webcrypto.subtle.exportKey('raw', keys.publicKey as unknown as webcrypto.CryptoKey));
    const compressed = Buffer.from(ECDH.convertKey(raw, 'prime256v1', undefined, undefined, 'compressed') as Buffer);
    const client = new PairingClient(url);
    clients.push(client);
    await client.opened();
    client.send({ type: 'hello', v: 1, kind: 'touch', publicKey: compressed.toString('base64'), firmware });
    await new Promise<void>((resolve) => client.ws.once('close', () => resolve()));
    expect(service.list()).toEqual([]);
  });

  it('closes a connection whose first message is not a valid hello', async () => {
    const client = new PairingClient(url);
    clients.push(client);
    await client.opened();
    client.send({ type: 'nonce', round: 1, nonce: 'AAAA' });
    await new Promise<void>((resolve) => client.ws.once('close', () => resolve()));
    expect(service.list()).toEqual([]);
  });

  it('revokes a paired reader and drops its bootstrap grant', async () => {
    const { code } = await announce();
    const pending = await pendingOf();
    const done = await service.approve(pending.id, { code, mode: 'new' }, actor);
    await service.revoke(done.targetReaderId as number, actor);
    expect(readers.get(done.targetReaderId as number)).toMatchObject({ pairingState: 'revoked' });
    expect(audited.at(-1)).toMatchObject({ action: 'reader.revoked' });
    expect(await service.resolveBootstrap({ spkiFingerprint: 'unknown', spki: Buffer.alloc(1) })).toBeNull();
  });
});
