import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Attractap } from '@attraccess/database-entities';
import { randomBytes, randomUUID, webcrypto } from 'crypto';
import type { IncomingMessage } from 'http';
import type { WebSocket } from 'ws';
import { AuditService } from '../../audit/audit.service';
import { AttractapService } from '../attractap.service';
import type { PairingFailureReason } from '../dtos/pairing.dto';
import { CredentialRegistryService } from './credential-registry.service';
import { InstallationIdentityService } from './installation-identity.service';
import { PairingCode, commitment, deriveCode, generateNonce, NONCE_BYTES } from './pairing-protocol';
import { spkiFingerprint } from './pki';

export const PAIRING_TTL_MS = 5 * 60 * 1000;
export const ANNOUNCE_TTL_MS = 15 * 60 * 1000;
export const MAX_PENDING_PAIRINGS = 64;
/** Connections that have not sent `hello` yet count against their own, smaller cap. */
const MAX_UNANNOUNCED_CONNECTIONS = 64;
const HELLO_TIMEOUT_MS = 30_000;
const IP_WINDOW_MS = 60_000;
const IP_MAX_PER_WINDOW = 12;
const MAX_MESSAGE_BYTES = 4096;
const TICKET_TTL_MS = PAIRING_TTL_MS;
const MAX_TICKETS = 256;

export const CREDENTIAL_CHANGED_EVENT = 'attractap.credential.changed';

export type PairingState = 'announced' | 'awaiting-confirmation' | 'completed' | 'failed' | 'cancelled' | 'expired';

export type PairingMode = 'new' | 'pair' | 'repair' | 'replace';

export interface Actor {
  userId: number;
  authenticationMethod: 'session' | 'api-token';
  apiTokenId?: number;
}

interface PairingRequest {
  id: string;
  ws: WebSocket;
  ip: string;
  createdAt: number;
  kind: 'touch' | 'lite';
  state: PairingState;
  readerPublicKey: Buffer;
  /** Set when the reader presented a binding ticket from its token connection in `hello`. */
  boundReaderId: number | null;
  serverPublicKey: Buffer;
  serverNonce: Buffer;
  readerNonce: Buffer | null;
  revealed: boolean;
  startedAt: number | null;
  expiresAt: number | null;
  mode: PairingMode | null;
  targetReaderId: number | null;
  code: PairingCode | null;
  readerConfirmed: boolean;
  adminConfirmed: boolean;
  actor: Actor | null;
  timer: NodeJS.Timeout | null;
  failureReason: PairingFailureReason | null;
}

export interface PairingView {
  id: string;
  state: PairingState;
  kind: 'touch' | 'lite';
  boundReaderId: number | null;
  targetReaderId: number | null;
  mode: PairingMode | null;
  keyFingerprint: string;
  createdAt: Date;
  expiresAt: Date | null;
  /** Only present after an admin started the pairing. */
  code: PairingCode | null;
  readerConfirmed: boolean;
  adminConfirmed: boolean;
  failureReason: PairingFailureReason | null;
}

/** What a freshly paired reader receives in its first (bootstrap) session. */
export interface BootstrapGrant {
  readerId: number;
  certificatePem: string;
}

interface CachedGrant extends BootstrapGrant {
  expiresAt: number;
}

@Injectable()
export class PairingService {
  private readonly logger = new Logger(PairingService.name);
  private readonly requests = new Map<string, PairingRequest>();
  private readonly ipHits = new Map<string, number[]>();
  /** Certificates issued at pairing, by key fingerprint, kept until the reader used one. */
  private readonly grants = new Map<string, CachedGrant>();
  /** One-time tickets that let a token reader bind its pairing request to its own record. */
  private readonly tickets = new Map<string, { readerId: number; expiresAt: number }>();
  private unannounced = 0;

  public constructor(
    private readonly attractap: AttractapService,
    private readonly identity: InstallationIdentityService,
    private readonly registry: CredentialRegistryService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // --- reader side -------------------------------------------------------------------------

  public handleConnection(ws: WebSocket, request: IncomingMessage): void {
    const ip = request.socket.remoteAddress ?? 'unknown';
    if (
      !this.allowIp(ip) ||
      this.pendingCount() >= MAX_PENDING_PAIRINGS ||
      this.unannounced >= MAX_UNANNOUNCED_CONNECTIONS
    ) {
      ws.close(1013, 'busy');
      return;
    }

    this.unannounced++;
    let announced = false;
    const leaveUnannounced = () => {
      if (announced) return;
      announced = true;
      this.unannounced--;
    };

    let current: PairingRequest | null = null;
    let helloSeen = false;
    const helloTimer = setTimeout(() => ws.close(1008, 'hello timeout'), HELLO_TIMEOUT_MS);
    ws.on('close', () => {
      clearTimeout(helloTimer);
      leaveUnannounced();
      if (current && !this.isTerminal(current)) void this.fail(current, 'reader-disconnected');
    });
    ws.on('error', () => undefined);
    ws.on('message', (data: Buffer, isBinary: boolean) => {
      // Claimed synchronously: anything arriving while `hello` is still processed is a violation.
      const isHello = !helloSeen;
      helloSeen = true;
      void (async () => {
        try {
          if (isBinary || (data as Buffer).length > MAX_MESSAGE_BYTES) throw new Error('bad message');
          const message = JSON.parse(data.toString('utf8')) as Record<string, unknown>;
          if (isHello) {
            clearTimeout(helloTimer);
            current = await this.onHello(ws, ip, message);
            leaveUnannounced();
            return;
          }
          if (!current) throw new Error('message before hello completed');
          await this.onReaderMessage(current, message);
        } catch (error) {
          this.logger.debug(`Pairing message rejected: ${(error as Error).message}`);
          if (current) await this.fail(current, 'protocol');
          else ws.close(1008, 'protocol');
        }
      })();
    });
  }

  private async onHello(ws: WebSocket, ip: string, message: Record<string, unknown>): Promise<PairingRequest> {
    if (message['type'] !== 'hello' || message['v'] !== 1) throw new Error('expected hello');
    const kind = message['kind'] === 'lite' ? 'lite' : message['kind'] === 'touch' ? 'touch' : null;
    if (!kind || typeof message['publicKey'] !== 'string') throw new Error('invalid hello');

    const readerPublicKey = Buffer.from(message['publicKey'], 'base64');
    // Rejects anything that is not a valid P-256 key in the canonical (uncompressed SPKI) form,
    // so the fingerprint confirmed here is the one later seen in the reader certificate.
    const imported = await webcrypto.subtle.importKey(
      'spki',
      new Uint8Array(readerPublicKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    );
    if (!Buffer.from(await webcrypto.subtle.exportKey('spki', imported)).equals(readerPublicKey)) {
      throw new Error('non-canonical public key');
    }

    let boundReaderId: number | null = null;
    if (typeof message['ticket'] === 'string') {
      const readerId = this.consumeTicket(message['ticket']);
      const reader = readerId ? await this.attractap.findReaderById(readerId) : null;
      if (reader && reader.pairingState === 'unpaired') boundReaderId = reader.id;
    }

    const serverPublicKey = await this.identity.getCaPublicKeySpki();
    if (ws.readyState !== ws.OPEN) throw new Error('reader went away');
    if (this.pendingCount() >= MAX_PENDING_PAIRINGS) {
      ws.close(1013, 'busy');
      throw new Error('too many pending pairings');
    }
    const serverNonce = generateNonce();
    const request: PairingRequest = {
      id: randomUUID(),
      ws,
      ip,
      createdAt: Date.now(),
      kind,
      state: 'announced',
      readerPublicKey,
      boundReaderId,
      serverPublicKey,
      serverNonce,
      readerNonce: null,
      revealed: false,
      startedAt: null,
      expiresAt: null,
      mode: null,
      targetReaderId: null,
      code: null,
      readerConfirmed: false,
      adminConfirmed: false,
      actor: null,
      failureReason: null,
      timer: setTimeout(() => void this.expire(request), ANNOUNCE_TTL_MS),
    };
    this.requests.set(request.id, request);

    this.send(request, {
      type: 'commit',
      serverPublicKey: serverPublicKey.toString('base64'),
      commitment: commitment(serverPublicKey, readerPublicKey, serverNonce).toString('base64'),
    });
    return request;
  }

  private async onReaderMessage(request: PairingRequest, message: Record<string, unknown>): Promise<void> {
    if (this.isTerminal(request)) return;
    switch (message['type']) {
      case 'nonce': {
        if (request.readerNonce || typeof message['nonce'] !== 'string') throw new Error('bad nonce');
        const nonce = Buffer.from(message['nonce'], 'base64');
        if (nonce.length < NONCE_BYTES || nonce.length > 64) throw new Error('bad nonce');
        request.readerNonce = nonce;
        request.code = deriveCode(
          request.kind,
          request.readerPublicKey,
          request.serverPublicKey,
          nonce,
          request.serverNonce,
        );
        this.maybeReveal(request);
        return;
      }
      case 'confirm':
        if (!request.revealed || request.readerConfirmed) throw new Error('unexpected confirm');
        request.readerConfirmed = true;
        await this.maybeComplete(request);
        return;
      case 'cancel':
        await this.fail(request, 'cancelled-at-reader');
        return;
      default:
        throw new Error('unknown message');
    }
  }

  // --- admin side --------------------------------------------------------------------------

  public list(): PairingView[] {
    return [...this.requests.values()].filter((r) => !this.isTerminal(r)).map((r) => this.view(r));
  }

  public get(id: string): PairingView {
    return this.view(this.mustFind(id));
  }

  /**
   * Hands a token-signed-in reader a one-time ticket. It presents the ticket in `hello` so its
   * pairing request is bound to its own record; the token itself never travels in pairing.
   */
  public issueBindingTicket(readerId: number): string {
    const now = Date.now();
    for (const [key, value] of this.tickets) if (value.expiresAt <= now) this.tickets.delete(key);
    if (this.tickets.size >= MAX_TICKETS) this.tickets.delete(this.tickets.keys().next().value as string);
    const ticket = randomBytes(16).toString('base64url');
    this.tickets.set(ticket, { readerId, expiresAt: now + TICKET_TTL_MS });
    return ticket;
  }

  public async start(
    id: string,
    input: { mode: PairingMode; targetReaderId?: number },
    actor: Actor,
  ): Promise<PairingView> {
    const request = this.mustFind(id);
    if (request.state !== 'announced' || request.startedAt) throw new ConflictException('Pairing already started');

    // Claim the pairing before the first await so concurrent starts cannot both pass the guard above.
    const startedAt = Date.now();
    request.startedAt = startedAt;
    let target: number | null = request.boundReaderId;
    try {
      if (input.mode === 'new') {
        if (request.boundReaderId) throw new BadRequestException('This reader already has a record; use pair');
      } else if (input.mode === 'pair') {
        if (!request.boundReaderId) throw new BadRequestException('Only readers signed in with a token can be paired');
      } else {
        if (!input.targetReaderId) throw new BadRequestException('targetReaderId is required');
        if (request.boundReaderId && request.boundReaderId !== input.targetReaderId) {
          throw new BadRequestException('This reader is bound to a different record');
        }
        target = input.targetReaderId;
        if (!(await this.attractap.findReaderById(target))) throw new NotFoundException('Reader not found');
      }
    } catch (error) {
      request.startedAt = null;
      throw error;
    }

    request.mode = input.mode;
    request.targetReaderId = target;
    request.actor = actor;
    request.expiresAt = startedAt + PAIRING_TTL_MS;
    if (request.timer) clearTimeout(request.timer);
    request.timer = setTimeout(() => void this.expire(request), PAIRING_TTL_MS);
    await this.record(target, 'reader.pairing_started', actor, { mode: input.mode });
    this.maybeReveal(request);
    return this.view(request);
  }

  public async confirm(id: string): Promise<PairingView> {
    const request = this.mustFind(id);
    if (!request.revealed || request.adminConfirmed || this.isTerminal(request)) {
      throw new ConflictException('Pairing is not awaiting confirmation');
    }
    request.adminConfirmed = true;
    await this.maybeComplete(request);
    return this.view(request);
  }

  public async cancel(id: string): Promise<void> {
    const request = this.mustFind(id);
    await this.fail(request, 'cancelled-by-admin');
  }

  /**
   * The certificate a reader receives in its bootstrap session: it proved in TLS that it holds
   * the key, and that key must be the reader's current paired credential. Normally this is the
   * certificate issued at pairing; if that was lost (server restart, dropped connection) a fresh
   * one is issued for the same key.
   */
  public async resolveBootstrap(peer: { spkiFingerprint: string; spki: Buffer }): Promise<BootstrapGrant | null> {
    const fingerprint = peer.spkiFingerprint;
    const cached = this.grants.get(fingerprint);
    if (cached && cached.expiresAt > Date.now() && (await this.registry.isActive(cached.readerId, fingerprint))) {
      return { readerId: cached.readerId, certificatePem: cached.certificatePem };
    }
    this.grants.delete(fingerprint);

    const readerId = await this.registry.findPairedReaderByFingerprint(fingerprint);
    if (!readerId) return null;
    const certificate = await this.identity.issueReaderCertificate(readerId, peer.spki);
    await this.registry.recordCertificate(readerId, fingerprint, certificate);
    return { readerId, certificatePem: certificate.pem };
  }

  /** The reader opened a normal session with its certificate: the bootstrap grant is spent. */
  public forgetGrant(keyFingerprint: string): void {
    this.grants.delete(keyFingerprint);
  }

  // --- lifecycle ---------------------------------------------------------------------------

  /** Revoke: the credential stops working immediately and the live session ends. */
  public async revoke(readerId: number, actor: Actor): Promise<void> {
    await this.registry.revoke(readerId, actor.userId);
    this.dropGrantsFor(readerId);
    this.events.emit(CREDENTIAL_CHANGED_EVENT, readerId);
    await this.record(readerId, 'reader.revoked', actor, { reason: 'admin' });
  }

  private maybeReveal(request: PairingRequest): void {
    if (request.revealed || !request.startedAt || !request.readerNonce || this.isTerminal(request)) return;
    request.revealed = true;
    request.state = 'awaiting-confirmation';
    this.send(request, { type: 'reveal', serverNonce: request.serverNonce.toString('base64') });
  }

  private async maybeComplete(request: PairingRequest): Promise<void> {
    if (!request.readerConfirmed || !request.adminConfirmed || this.isTerminal(request)) return;
    if (!request.code || !request.mode || !request.actor) return;
    if ((request.expiresAt ?? 0) < Date.now()) return await this.expire(request);

    // Mark first: a second confirmation can never complete the same pairing again.
    request.state = 'completed';
    const { actor, mode } = request;
    let created: Attractap | null = null;
    try {
      const fingerprint = spkiFingerprint(request.readerPublicKey);
      let reader: Attractap | null;
      if (mode === 'new') {
        created = (await this.attractap.createNewReader()).reader;
        reader = created;
      } else {
        reader = request.targetReaderId ? await this.attractap.findReaderById(request.targetReaderId) : null;
      }
      if (!reader) throw new Error('target reader disappeared');

      const certificate = await this.identity.issueReaderCertificate(reader.id, request.readerPublicKey);
      const { previousFingerprint } = await this.registry.markPaired({
        readerId: reader.id,
        fingerprint,
        certificate,
        actorId: actor.userId,
        previousCredentialBecomes: mode === 'replace' ? 'replaced' : 'revoked',
      });
      created = null; // committed: nothing to roll back any more
      this.dropGrantsFor(reader.id);
      this.grants.set(fingerprint, {
        readerId: reader.id,
        certificatePem: certificate.pem,
        expiresAt: Date.now() + PAIRING_TTL_MS,
      });
      this.events.emit(CREDENTIAL_CHANGED_EVENT, reader.id);

      if (previousFingerprint) {
        if (mode === 'replace') await this.record(reader.id, 'reader.replaced', actor, { replacedReaderId: reader.id });
        else await this.record(reader.id, 'reader.revoked', actor, { reason: 'repair' });
      }
      await this.record(reader.id, 'reader.pairing_confirmed', actor, { mode });
      this.send(request, { type: 'accepted' });
      this.finish(request);
    } catch (error) {
      this.logger.error(`Completing pairing failed: ${(error as Error).message}`);
      if (created) await this.attractap.deleteReader(created.id).catch(() => undefined);
      request.state = 'failed';
      request.failureReason = 'internal';
      this.send(request, { type: 'failed', reason: 'internal' });
      this.finish(request);
    }
  }

  private async fail(request: PairingRequest, reason: PairingFailureReason): Promise<void> {
    if (this.isTerminal(request)) return;
    request.state = reason === 'cancelled-at-reader' || reason === 'cancelled-by-admin' ? 'cancelled' : 'failed';
    request.failureReason = reason;
    this.send(request, { type: 'failed', reason });
    this.finish(request);
    await this.record(request.targetReaderId, 'reader.pairing_failed', request.actor, { reason });
  }

  private async expire(request: PairingRequest): Promise<void> {
    if (this.isTerminal(request)) return;
    request.state = 'expired';
    request.failureReason = 'expired';
    this.send(request, { type: 'failed', reason: 'expired' });
    this.finish(request);
    await this.record(request.targetReaderId, 'reader.pairing_expired', request.actor, { reason: 'timeout' });
  }

  /** Closes the reader connection of a request that has reached a terminal state. */
  private finish(request: PairingRequest): void {
    if (request.timer) clearTimeout(request.timer);
    request.timer = null;
    try {
      request.ws.close(1000);
    } catch {
      // already closed
    }
    // Keep the terminal request visible to the admin dialog for a short while.
    setTimeout(() => this.requests.delete(request.id), 60_000).unref();
  }

  private dropGrantsFor(readerId: number): void {
    for (const [key, grant] of this.grants) if (grant.readerId === readerId) this.grants.delete(key);
  }

  private consumeTicket(ticket: string): number | null {
    const entry = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    return entry && entry.expiresAt > Date.now() ? entry.readerId : null;
  }

  // --- helpers -----------------------------------------------------------------------------

  private async record(
    readerId: number | null,
    action:
      | 'reader.pairing_started'
      | 'reader.pairing_confirmed'
      | 'reader.pairing_failed'
      | 'reader.pairing_expired'
      | 'reader.revoked'
      | 'reader.replaced',
    actor: Actor | null,
    details: Record<string, string | number>,
  ): Promise<void> {
    if (!readerId || !actor) return; // the audit log needs a reader and a responsible person
    await this.audit
      .recordAttractap({
        action,
        actorId: actor.userId,
        authenticationMethod: actor.authenticationMethod,
        apiTokenId: actor.authenticationMethod === 'api-token' ? actor.apiTokenId : undefined,
        subjectId: readerId,
        details,
      })
      .catch(() => undefined);
  }

  private send(request: PairingRequest, message: Record<string, unknown>): void {
    try {
      request.ws.send(JSON.stringify(message));
    } catch {
      // reader went away
    }
  }

  private view(request: PairingRequest): PairingView {
    return {
      id: request.id,
      state: request.state,
      kind: request.kind,
      boundReaderId: request.boundReaderId,
      targetReaderId: request.targetReaderId,
      mode: request.mode,
      keyFingerprint: spkiFingerprint(request.readerPublicKey).slice(0, 16),
      createdAt: new Date(request.createdAt),
      expiresAt: request.expiresAt ? new Date(request.expiresAt) : null,
      code: request.startedAt && request.code ? request.code : null,
      readerConfirmed: request.readerConfirmed,
      adminConfirmed: request.adminConfirmed,
      failureReason: request.failureReason,
    };
  }

  private mustFind(id: string): PairingRequest {
    const request = this.requests.get(id);
    if (!request) throw new NotFoundException('Pairing not found');
    return request;
  }

  private isTerminal(request: PairingRequest): boolean {
    return ['completed', 'failed', 'cancelled', 'expired'].includes(request.state);
  }

  private pendingCount(): number {
    return [...this.requests.values()].filter((r) => !this.isTerminal(r)).length;
  }

  private allowIp(ip: string): boolean {
    const now = Date.now();
    const hits = (this.ipHits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
    hits.push(now);
    this.ipHits.set(ip, hits);
    if (this.ipHits.size > 1024) {
      for (const [key, value] of this.ipHits) if (value.every((t) => now - t >= IP_WINDOW_MS)) this.ipHits.delete(key);
    }
    return hits.length <= IP_MAX_PER_WINDOW;
  }
}
