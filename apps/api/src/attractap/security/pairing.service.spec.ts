import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { ECDH, webcrypto } from 'crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { PairingService } from './pairing.service';
import { commitmentMatches, deriveCode } from './pairing-protocol';
import { PAIRING_SUBPROTOCOL } from './session-framing';
import { spkiFingerprint } from './pki';

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
  public constructor(url: string) {
    this.ws = new WebSocket(url, PAIRING_SUBPROTOCOL);
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
  let caSpki: Buffer;
  const readers = new Map<number, Record<string, unknown>>();
  const credentialEvents: Array<Record<string, unknown>> = [];
  const audited: Array<Record<string, unknown>> = [];
  const emitted: unknown[] = [];
  const clients: PairingClient[] = [];
  let nextId = 1;
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
    service = new PairingService(
      attractap as never,
      identity as never,
      registry as never,
      { recordAttractap: async (event: Record<string, unknown>) => void audited.push(event) } as never,
      { emit: (_e: string, id: unknown) => emitted.push(id) } as never,
    );
  });

  afterEach(() => {
    clients.splice(0).forEach((c) => c.ws.close());
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    wss.close();
    await new Promise((resolve) => http.close(resolve));
  });

  async function announce(extra: Record<string, unknown> = {}, kind: 'touch' | 'lite' = 'touch') {
    const publicKey = await readerKey();
    const client = new PairingClient(url);
    clients.push(client);
    await client.opened();
    client.send({ type: 'hello', v: 1, kind, publicKey: publicKey.toString('base64'), ...extra });
    const commit = await client.next('commit');
    const readerNonce = Buffer.alloc(16, 9);
    client.send({ type: 'nonce', nonce: readerNonce.toString('base64') });
    return { client, publicKey, readerNonce, commit };
  }

  const waitFor = async (predicate: () => boolean) => {
    for (let i = 0; i < 100 && !predicate(); i++) await new Promise((r) => setTimeout(r, 20));
  };

  it('pairs a new reader when the code is confirmed in both places', async () => {
    const { client, publicKey, readerNonce, commit } = await announce();
    await waitFor(() => service.list().length === 1);
    const [pending] = service.list();
    expect(pending.code).toBeNull(); // no code before an admin starts

    await service.start(pending.id, { mode: 'new' }, actor);
    const reveal = await client.next('reveal');

    // The reader checks the commitment, then derives the code itself.
    const serverNonce = Buffer.from(reveal['serverNonce'] as string, 'base64');
    const serverKey = Buffer.from(commit['serverPublicKey'] as string, 'base64');
    expect(
      commitmentMatches(Buffer.from(commit['commitment'] as string, 'base64'), serverKey, publicKey, serverNonce),
    ).toBe(true);
    const readerCode = deriveCode('touch', publicKey, serverKey, readerNonce, serverNonce);
    expect(service.get(pending.id).code).toEqual(readerCode);

    client.send({ type: 'confirm' });
    await waitFor(() => service.get(pending.id).readerConfirmed);
    expect(readers.size).toBe(0); // not before the admin confirms
    await service.confirm(pending.id);
    await client.next('accepted');

    const reader = readers.get(1) as Record<string, unknown>;
    expect(reader).toMatchObject({ pairingState: 'paired', apiTokenHash: '' });
    expect(reader['credentialFingerprint']).toBe(spkiFingerprint(publicKey));
    expect(credentialEvents).toEqual([expect.objectContaining({ state: 'paired', readerId: 1 })]);
    const peer = { spkiFingerprint: spkiFingerprint(publicKey), spki: publicKey };
    // The grant survives until the reader opened a normal session with it...
    expect(await service.resolveBootstrap(peer)).toMatchObject({ readerId: 1, certificatePem: 'CERT' });
    expect(await service.resolveBootstrap(peer)).toMatchObject({ readerId: 1, certificatePem: 'CERT' });
    service.forgetGrant(peer.spkiFingerprint);
    // ... and a lost certificate is re-issued for the paired key (e.g. after a server restart).
    expect(await service.resolveBootstrap(peer)).toMatchObject({ readerId: 1 });
    expect(registry['recordCertificate']).toHaveBeenCalledWith(
      1,
      peer.spkiFingerprint,
      expect.objectContaining({ serial: '01' }),
    );
    // An unknown key gets nothing.
    const stranger = await readerKey();
    expect(await service.resolveBootstrap({ spkiFingerprint: spkiFingerprint(stranger), spki: stranger })).toBeNull();

    // The same pairing cannot be confirmed a second time.
    await expect(service.confirm(pending.id)).rejects.toThrow();
  });

  it('shows a different code when a man in the middle swaps the reader key', async () => {
    const { client, publicKey, readerNonce, commit } = await announce();
    await waitFor(() => service.list().length === 1);
    const [pending] = service.list();
    await service.start(pending.id, { mode: 'new' }, actor);
    const reveal = await client.next('reveal');

    const attackerKey = await readerKey();
    const serverKey = Buffer.from(commit['serverPublicKey'] as string, 'base64');
    const serverNonce = Buffer.from(reveal['serverNonce'] as string, 'base64');
    expect(deriveCode('touch', attackerKey, serverKey, readerNonce, serverNonce)).not.toEqual(
      service.get(pending.id).code,
    );
    // ... and a swapped key fails the commitment check as well.
    expect(
      commitmentMatches(Buffer.from(commit['commitment'] as string, 'base64'), serverKey, attackerKey, serverNonce),
    ).toBe(false);
    expect(publicKey).toBeDefined();
  });

  it('does not pair when the reader never confirms, or when the time is up', async () => {
    const { client } = await announce();
    await waitFor(() => service.list().length === 1);
    const [pending] = service.list();
    await service.start(pending.id, { mode: 'new' }, actor);
    await client.next('reveal');
    await service.confirm(pending.id); // admin only
    expect(readers.size).toBe(0);

    client.send({ type: 'confirm' });
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 6 * 60 * 1000);
    await waitFor(() => service.get(pending.id).state === 'expired');
    expect(service.get(pending.id).state).toBe('expired');
    expect(readers.size).toBe(0);
  });

  it('aborts when the reader cancels', async () => {
    const { client } = await announce();
    await waitFor(() => service.list().length === 1);
    const [pending] = service.list();
    await service.start(pending.id, { mode: 'new' }, actor);
    await client.next('reveal');
    client.send({ type: 'cancel' });
    await waitFor(() => service.get(pending.id).state === 'cancelled');
    await expect(service.confirm(pending.id)).rejects.toThrow();
  });

  it('binds a token reader through its one-time ticket and upgrades it in place', async () => {
    readers.set(7, { id: 7, name: 'press', pairingState: 'unpaired', apiTokenHash: 'h', credentialFingerprint: null });
    const ticket = service.issueBindingTicket(7);
    const { client, publicKey } = await announce({ ticket }, 'lite');
    await waitFor(() => service.list().length === 1);
    const [pending] = service.list();
    expect(pending.boundReaderId).toBe(7);
    await expect(service.start(pending.id, { mode: 'new' }, actor)).rejects.toThrow();
    await service.start(pending.id, { mode: 'pair' }, actor);
    await waitFor(() => service.get(pending.id).state === 'awaiting-confirmation');
    expect(service.get(pending.id).code?.kind).toBe('colours');
    await client.next('reveal');
    client.send({ type: 'confirm' });
    await waitFor(() => service.get(pending.id).readerConfirmed);
    await service.confirm(pending.id);
    await client.next('accepted');
    expect(readers.get(7)).toMatchObject({ pairingState: 'paired', apiTokenHash: '' });
    expect(readers.get(7)?.['credentialFingerprint']).toBe(spkiFingerprint(publicKey));
    expect(emitted).toContain(7);
  });

  it('does not bind with an unknown or already used ticket', async () => {
    readers.set(8, { id: 8, name: 'x', pairingState: 'unpaired', apiTokenHash: 'h', credentialFingerprint: null });
    const ticket = service.issueBindingTicket(8);
    await announce({ ticket: 'made-up' });
    await announce({ ticket });
    await announce({ ticket }); // second use
    await waitFor(() => service.list().length === 3);
    expect(service.list().map((p) => p.boundReaderId)).toEqual([null, 8, null]);
  });

  it('creates exactly one request when hello is sent several times in a burst', async () => {
    const publicKey = await readerKey();
    const client = new PairingClient(url);
    clients.push(client);
    await client.opened();
    const closed = new Promise<void>((resolve) => client.ws.once('close', () => resolve()));
    const hello = { type: 'hello', v: 1, kind: 'touch', publicKey: publicKey.toString('base64') };
    for (let i = 0; i < 5; i++) client.send(hello);
    await closed;
    await waitFor(() => service.list().length === 0);
    // The second hello is a protocol violation: the first request is failed, nothing else was created.
    expect(service.list()).toHaveLength(0);
  });

  it('rejects a public key that is not in canonical uncompressed form', async () => {
    const publicKey = await readerKey();
    // The same key as a compressed point: valid P-256, but not the uncompressed SPKI the
    // certificate will carry, so its fingerprint would never match later.
    const point = ECDH.convertKey(publicKey.subarray(26), 'prime256v1', undefined, undefined, 'compressed') as Buffer;
    const compressed = Buffer.concat([
      Buffer.from('3039301306072a8648ce3d020106082a8648ce3d030107032200', 'hex'),
      point,
    ]);
    const client = new PairingClient(url);
    clients.push(client);
    await client.opened();
    const closed = new Promise<number>((resolve) => client.ws.once('close', (code) => resolve(code)));
    client.send({ type: 'hello', v: 1, kind: 'touch', publicKey: compressed.toString('base64') });
    expect(await closed).toBe(1008);
    expect(service.list()).toHaveLength(0);
  });

  it('fails a confirmed-twice reader and keeps the reason; a new pairing gets a new code', async () => {
    const first = await announce();
    await waitFor(() => service.list().length === 1);
    const [pending] = service.list();
    await service.start(pending.id, { mode: 'new' }, actor);
    await first.client.next('reveal');
    const firstCode = service.get(pending.id).code;
    first.client.send({ type: 'confirm' });
    first.client.send({ type: 'confirm' });
    await waitFor(() => service.get(pending.id).state === 'failed');
    expect(service.get(pending.id).failureReason).toBe('protocol');
    await expect(service.confirm(pending.id)).rejects.toThrow();

    const second = await announce();
    await waitFor(() => service.list().length === 1);
    const [next] = service.list();
    await service.start(next.id, { mode: 'new' }, actor);
    await second.client.next('reveal');
    expect(service.get(next.id).code).not.toEqual(firstCode);
  });

  it('records re-pair and replace in the history and revokes on request', async () => {
    readers.set(3, {
      id: 3,
      name: 'lathe',
      pairingState: 'paired',
      apiTokenHash: '',
      credentialFingerprint: 'old-fingerprint',
      certificateSerial: '0a',
    });
    const { client } = await announce();
    await waitFor(() => service.list().length === 1);
    const [pending] = service.list();
    await service.start(pending.id, { mode: 'replace', targetReaderId: 3 }, actor);
    await client.next('reveal');
    client.send({ type: 'confirm' });
    await waitFor(() => service.get(pending.id).readerConfirmed);
    await service.confirm(pending.id);
    await client.next('accepted');
    expect(credentialEvents.map((e) => [e['state'], e['keyFingerprint']])).toEqual([
      ['replaced', 'old-fingerprint'],
      ['paired', expect.any(String)],
    ]);

    await service.revoke(3, actor);
    expect(readers.get(3)).toMatchObject({ pairingState: 'revoked' });
    expect(credentialEvents[2]).toMatchObject({ state: 'revoked', readerId: 3 });
    expect(emitted.filter((id) => id === 3).length).toBe(2);
    await expect(service.revoke(3, actor)).rejects.toThrow('not paired');
  });

  it('lets only one of several concurrent starts through, and audits a re-pair as a revoke', async () => {
    readers.set(4, {
      id: 4,
      name: 'mill',
      pairingState: 'paired',
      apiTokenHash: '',
      credentialFingerprint: 'old-fingerprint',
    });
    const { client } = await announce();
    await waitFor(() => service.list().length === 1);
    const [pending] = service.list();
    const results = await Promise.allSettled(
      [1, 2, 3].map(() => service.start(pending.id, { mode: 'repair', targetReaderId: 4 }, actor)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(2);

    await client.next('reveal');
    client.send({ type: 'confirm' });
    await waitFor(() => service.get(pending.id).readerConfirmed);
    await service.confirm(pending.id);
    await client.next('accepted');
    expect(audited.map((e) => [e['action'], e['details']])).toEqual(
      expect.arrayContaining([['reader.revoked', { reason: 'repair' }]]),
    );
  });

  it('rate limits announcements per IP', async () => {
    let refused = 0;
    const sockets = Array.from({ length: 14 }, () => {
      const c = new PairingClient(url);
      clients.push(c);
      c.ws.on('close', (code) => {
        if (code === 1013) refused++;
      });
      return c;
    });
    await Promise.all(sockets.map((c) => c.opened()));
    await waitFor(() => refused >= 2);
    expect(refused).toBe(2);
  });
});
