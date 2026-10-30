import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationShutdown,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Attractap } from '@attraccess/database-entities';
import { randomBytes, randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import type { WebSocket } from 'ws';
import { AuditService } from '../../audit/audit.service';
import { resolveClientAddress } from '../../device-enrollment/client-address';
import {
  ENROLLMENT_CODE_ROTATION_MS,
  ENROLLMENT_REQUEST_TTL_MS,
} from '../../device-enrollment/device-enrollment.constants';
import { normalizeEnrollmentCode } from '../../device-enrollment/enrollment-code';
import { EnrollmentLimitsService } from '../../device-enrollment/enrollment-limits.service';
import { SettingsService } from '../../settings/settings.service';
import { AttractapService } from '../attractap.service';
import type { PairingFailureReason } from '../dtos/pairing.dto';
import { CredentialRegistryService } from './credential-registry.service';
import { InstallationIdentityService } from './installation-identity.service';
import { commitment, deriveCode, generateNonce, NONCE_BYTES } from './pairing-protocol';
import { spkiFingerprint } from './pki';
import {
  Actor,
  ApproveInput,
  BootstrapGrant,
  CREDENTIAL_CHANGED_EVENT,
  CachedGrant,
  PairingMethod,
  PairingMode,
  PairingRequest,
  PairingView,
  Round,
  canonicalP256Spki,
  isTerminal,
  roundsOf,
  validFirmware,
} from './pairing-model';

export type {
  Actor,
  ApproveInput,
  BootstrapGrant,
  PairingMethod,
  PairingMode,
  PairingState,
  PairingView,
  ReaderFirmware,
} from './pairing-model';

const HELLO_TIMEOUT_MS = 30_000;
const MAX_MESSAGE_BYTES = 4096;
const TICKET_TTL_MS = 5 * 60 * 1000;
const MAX_TICKETS = 256;
const MAX_NAME_LENGTH = 64;
const GRANT_TTL_MS = 5 * 60 * 1000;
const APP_URL_CACHE_MS = ENROLLMENT_CODE_ROTATION_MS;
const TERMINAL_VISIBLE_MS = 60_000;

export { CREDENTIAL_CHANGED_EVENT };

@Injectable()
export class PairingService implements OnApplicationShutdown {
  private readonly logger = new Logger(PairingService.name);
  private readonly requests = new Map<string, PairingRequest>();
  /** Certificates issued at pairing, by key fingerprint, kept until the reader used one. */
  private readonly grants = new Map<string, CachedGrant>();
  /** One-time tickets that let a token reader bind its pairing request to its own record. */
  private readonly tickets = new Map<string, { readerId: number; expiresAt: number }>();
  private appUrl: { value: string | null; fetchedAt: number } | null = null;

  public constructor(
    private readonly attractap: AttractapService,
    private readonly identity: InstallationIdentityService,
    private readonly registry: CredentialRegistryService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly limits: EnrollmentLimitsService,
    private readonly settings: SettingsService,
  ) {}

  public onApplicationShutdown(): void {
    for (const request of this.requests.values()) this.clearTimers(request);
  }

  // --- reader side -------------------------------------------------------------------------

  public handleConnection(ws: WebSocket, request: IncomingMessage): void {
    const connectionId = randomUUID();
    const address = resolveClientAddress(request, process.env.TRUST_PROXY);
    let current: PairingRequest | null = null;
    let queue: Promise<void> = Promise.resolve();
    let helloTimer = setTimeout(() => ws.close(1008, 'hello timeout'), HELLO_TIMEOUT_MS);

    ws.on('close', () => {
      clearTimeout(helloTimer);
      this.limits.forgetConnection(connectionId);
      if (current && !isTerminal(current)) void this.fail(current, 'reader-disconnected');
    });
    ws.on('error', () => undefined);
    ws.on('message', (data: Buffer, isBinary: boolean) => {
      // Messages of one connection are handled strictly one after another.
      queue = queue.then(async () => {
        try {
          if (isBinary || data.length > MAX_MESSAGE_BYTES) throw new Error('bad message');
          const message = JSON.parse(data.toString('utf8')) as Record<string, unknown>;
          if (!current || isTerminal(current)) {
            clearTimeout(helloTimer);
            current = await this.onHello(ws, connectionId, address, message);
            return;
          }
          await this.onReaderMessage(current, message);
          if (isTerminal(current) && ws.readyState === ws.OPEN) {
            // A cancelled request leaves the connection open for a new `hello`.
            helloTimer = setTimeout(() => ws.close(1008, 'hello timeout'), HELLO_TIMEOUT_MS);
          }
        } catch (error) {
          this.logger.debug(`Pairing message rejected: ${(error as Error).message}`);
          if (current && !isTerminal(current)) await this.fail(current, 'protocol');
          else ws.close(1008, 'protocol');
        }
      });
    });
  }

  private async onHello(
    ws: WebSocket,
    connectionId: string,
    address: string,
    message: Record<string, unknown>,
  ): Promise<PairingRequest | null> {
    if (message['type'] !== 'hello' || message['v'] !== 1) throw new Error('expected hello');
    if (message['kind'] !== 'lite' && message['kind'] !== 'touch') throw new Error('invalid hello');
    const kind = message['kind'];
    const firmware = validFirmware(message['firmware']);
    const readerPublicKey = await canonicalP256Spki(message['publicKey']);
    const boundReaderId = await this.resolveTicket(message['ticket']);

    const admission = this.limits.admit(connectionId, address);
    if (!admission.allowed) {
      this.refuse(ws, admission.reason === 'RATE_LIMITED' ? 'rate-limited' : 'busy');
      return null;
    }
    const serverPublicKey = await this.identity.getCaPublicKeySpki();
    if (ws.readyState !== ws.OPEN) throw new Error('reader went away');

    const id = randomUUID();
    if (!this.limits.reservePending(id, address)) {
      this.refuse(ws, 'busy');
      return null;
    }
    const now = Date.now();
    const request: PairingRequest = {
      id,
      ws,
      address,
      createdAt: now,
      expiresAt: now + ENROLLMENT_REQUEST_TTL_MS,
      kind,
      firmware,
      state: 'waiting',
      readerPublicKey,
      boundReaderId,
      serverPublicKey,
      current: this.newRound(1),
      previous: null,
      nextRotationAt: now + ENROLLMENT_CODE_ROTATION_MS,
      approving: false,
      mode: null,
      targetReaderId: boundReaderId,
      rotationTimer: null,
      expiryTimer: null,
      failureReason: null,
    };
    request.rotationTimer = setInterval(() => void this.rotate(request), ENROLLMENT_CODE_ROTATION_MS);
    request.expiryTimer = setTimeout(() => void this.expire(request), ENROLLMENT_REQUEST_TTL_MS);
    request.rotationTimer.unref?.();
    request.expiryTimer.unref?.();
    this.requests.set(id, request);
    await this.announceRound(request);
    return request;
  }

  /** An unknown or already used ticket is refused rather than treated as a new reader. */
  private async resolveTicket(ticket: unknown): Promise<number | null> {
    if (ticket === undefined) return null;
    const readerId = typeof ticket === 'string' ? this.consumeTicket(ticket) : null;
    const reader = readerId ? await this.attractap.findReaderById(readerId) : null;
    if (!reader || reader.pairingState !== 'unpaired') throw new Error('invalid ticket');
    return reader.id;
  }

  private refuse(ws: WebSocket, reason: 'rate-limited' | 'busy'): void {
    try {
      ws.send(JSON.stringify({ type: 'failed', reason }));
    } catch {
      // reader went away
    }
    ws.close(1013, reason);
  }

  private async onReaderMessage(request: PairingRequest, message: Record<string, unknown>): Promise<void> {
    switch (message['type']) {
      case 'nonce':
        return this.onNonce(request, message);
      case 'cancel':
        await this.fail(request, 'cancelled-at-reader');
        return;
      default:
        throw new Error('unknown message');
    }
  }

  private onNonce(request: PairingRequest, message: Record<string, unknown>): void {
    const round = roundsOf(request).find((candidate) => candidate.round === message['round']);
    if (!round || round.readerNonce || typeof message['nonce'] !== 'string') throw new Error('bad nonce');
    const nonce = Buffer.from(message['nonce'], 'base64');
    if (nonce.length < NONCE_BYTES || nonce.length > 64) throw new Error('bad nonce');
    round.readerNonce = nonce;
    round.derived = deriveCode(request.readerPublicKey, request.serverPublicKey, nonce, round.serverNonce);
    this.send(request, { type: 'reveal', round: round.round, serverNonce: round.serverNonce.toString('base64') });
  }

  private newRound(round: number): Round {
    return { round, serverNonce: generateNonce(), readerNonce: null, derived: null };
  }

  private async rotate(request: PairingRequest): Promise<void> {
    if (isTerminal(request)) return;
    request.previous = request.current;
    request.current = this.newRound(request.current.round + 1);
    request.nextRotationAt = Date.now() + ENROLLMENT_CODE_ROTATION_MS;
    await this.announceRound(request);
  }

  private async announceRound(request: PairingRequest): Promise<void> {
    const appUrl = await this.currentAppUrl();
    const now = Date.now();
    this.send(request, {
      type: 'round',
      round: request.current.round,
      serverPublicKey: request.serverPublicKey.toString('base64'),
      commitment: commitment(request.serverPublicKey, request.readerPublicKey, request.current.serverNonce).toString(
        'base64',
      ),
      appUrl,
      rotatesInSeconds: Math.max(0, Math.ceil((request.nextRotationAt - now) / 1000)),
      expiresInSeconds: Math.max(0, Math.ceil((request.expiresAt - now) / 1000)),
    });
  }

  private async currentAppUrl(): Promise<string | null> {
    const now = Date.now();
    if (this.appUrl && now - this.appUrl.fetchedAt < APP_URL_CACHE_MS) return this.appUrl.value;
    const value = (await this.settings.getUrl().catch(() => null)) || null;
    this.appUrl = { value, fetchedAt: now };
    return value;
  }

  // --- admin side --------------------------------------------------------------------------

  public list(): PairingView[] {
    return [...this.requests.values()].filter((r) => !isTerminal(r)).map((r) => this.view(r, false));
  }

  public get(id: string): PairingView {
    return this.view(this.mustFind(id), true);
  }

  /**
   * Finds the waiting reader that shows this code. A wrong code counts toward the approver's limit;
   * a code two readers show at the same time is not a wrong code, the admin just waits for the next one.
   */
  public resolve(rawCode: string, actor: Actor): PairingView {
    return this.view(this.requestForCode(rawCode, actor), false);
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

  /** The one admin action: checks the code or pattern, then enrolls and pairs in one go. */
  public async approve(id: string, input: ApproveInput, actor: Actor): Promise<PairingView> {
    this.limits.assertApproverAllowed(actor.userId);
    const request = this.mustFind(id);
    if (isTerminal(request) || request.approving) throw new ConflictException('PairingNotWaiting');
    const method = this.verifyProof(request, input, actor);
    this.limits.clearApprover(actor.userId);

    // Claimed before the first await so concurrent approvals cannot both pass the guards above.
    request.approving = true;
    try {
      const target = await this.resolveTarget(request, input);
      await this.complete(request, input, target, method, actor);
    } finally {
      request.approving = false;
    }
    return this.view(request, true);
  }

  public async cancel(id: string): Promise<void> {
    const request = this.mustFind(id);
    await this.fail(request, 'cancelled-by-admin');
  }

  private requestForCode(rawCode: string, actor: Actor): PairingRequest {
    this.limits.assertApproverAllowed(actor.userId);
    const code = normalizeEnrollmentCode(rawCode ?? '');
    const matches = code ? [...this.requests.values()].filter((r) => !isTerminal(r) && this.codeMatches(r, code)) : [];
    if (matches.length === 0) {
      this.limits.recordWrongCode(actor.userId);
      throw new NotFoundException('PairingCodeNotFound');
    }
    if (matches.length > 1) throw new ConflictException('PairingCodeAmbiguous');
    return matches[0];
  }

  private codeMatches(request: PairingRequest, code: string): boolean {
    return roundsOf(request).some((round) => round.derived?.code === code);
  }

  /** Throws unless the admin proved they compared the right reader; returns how they did it. */
  private verifyProof(request: PairingRequest, input: ApproveInput, actor: Actor): PairingMethod {
    if (input.code !== undefined) {
      const matched = this.requestForCode(input.code, actor);
      if (matched !== request) {
        this.limits.recordWrongCode(actor.userId);
        throw new NotFoundException('PairingCodeNotFound');
      }
      return input.via === 'flasher' ? 'flasher' : 'code';
    }
    if (input.round === undefined || request.kind !== 'lite') throw new BadRequestException('CodeRequired');
    const round = roundsOf(request).find((candidate) => candidate.round === input.round);
    if (!round?.derived) throw new ConflictException('PairingRoundStale');
    return 'led-pattern';
  }

  private async resolveTarget(request: PairingRequest, input: ApproveInput): Promise<number | null> {
    if (input.mode === 'new') {
      if (request.boundReaderId) throw new BadRequestException('This reader already has a record; use pair');
      return null;
    }
    if (input.mode === 'pair') {
      if (!request.boundReaderId) throw new BadRequestException('Only readers signed in with a token can be paired');
      return request.boundReaderId;
    }
    if (!input.targetReaderId) throw new BadRequestException('targetReaderId is required');
    if (request.boundReaderId && request.boundReaderId !== input.targetReaderId) {
      throw new BadRequestException('This reader is bound to a different record');
    }
    if (!(await this.attractap.findReaderById(input.targetReaderId))) throw new NotFoundException('Reader not found');
    return input.targetReaderId;
  }

  private async complete(
    request: PairingRequest,
    input: ApproveInput,
    targetId: number | null,
    method: PairingMethod,
    actor: Actor,
  ): Promise<void> {
    if (request.ws.readyState !== request.ws.OPEN) {
      await this.fail(request, 'reader-disconnected');
      throw new ConflictException('PairingReaderGone');
    }
    let created: Attractap | null = null;
    try {
      const fingerprint = spkiFingerprint(request.readerPublicKey);
      let reader: Attractap | null;
      if (targetId) {
        reader = await this.attractap.findReaderById(targetId);
      } else {
        created = (await this.attractap.createNewReader()).reader;
        reader = created;
        const name = input.name?.trim();
        if (name) reader = await this.attractap.updateReader(created.id, { name: name.slice(0, MAX_NAME_LENGTH) });
      }
      if (!reader) throw new Error('target reader disappeared');

      const certificate = await this.identity.issueReaderCertificate(reader.id, request.readerPublicKey);
      const { previousFingerprint } = await this.registry.markPaired({
        readerId: reader.id,
        fingerprint,
        certificate,
        actorId: actor.userId,
        previousCredentialBecomes: input.mode === 'takeover' ? 'replaced' : 'revoked',
      });
      request.state = 'completed';
      request.mode = input.mode;
      request.targetReaderId = reader.id;
      this.dropGrantsFor(reader.id);
      this.grants.set(fingerprint, {
        readerId: reader.id,
        certificatePem: certificate.pem,
        expiresAt: Date.now() + GRANT_TTL_MS,
      });
      this.events.emit(CREDENTIAL_CHANGED_EVENT, reader.id);
      this.deliverAccepted(request);
      created = null; // delivered: nothing to roll back any more
      await this.recordApproval(reader.id, input.mode, method, actor, previousFingerprint !== null);
      this.finish(request);
    } catch (error) {
      await this.rollBack(request, created, error as Error);
      throw error instanceof ConflictException || error instanceof NotFoundException
        ? error
        : new ConflictException('PairingFailed');
    }
  }

  private deliverAccepted(request: PairingRequest): void {
    // `send` throws when the connection is gone; the caller then rolls the new record back.
    request.ws.send(JSON.stringify({ type: 'accepted' }));
  }

  private async rollBack(request: PairingRequest, created: Attractap | null, error: Error): Promise<void> {
    this.logger.error(`Completing pairing failed: ${error.message}`);
    if (created) {
      this.dropGrantsFor(created.id);
      await this.attractap.deleteReader(created.id).catch(() => undefined);
    }
    if (!isTerminal(request) || request.state === 'completed') {
      request.state = 'failed';
      request.failureReason = 'internal';
      this.send(request, { type: 'failed', reason: 'internal' });
      this.finish(request);
    }
  }

  private async recordApproval(
    readerId: number,
    mode: PairingMode,
    method: PairingMethod,
    actor: Actor,
    hadPrevious: boolean,
  ): Promise<void> {
    if (hadPrevious) await this.record(readerId, 'reader.replaced', actor, { replacedReaderId: readerId });
    if (mode === 'new') await this.record(readerId, 'reader.enrolled', actor, { method });
    else await this.record(readerId, 'reader.pairing_confirmed', actor, { mode, method });
  }

  // --- bootstrap and lifecycle -------------------------------------------------------------

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

  /** Revoke: the credential stops working immediately and the live session ends. */
  public async revoke(readerId: number, actor: Actor): Promise<void> {
    await this.registry.revoke(readerId, actor.userId);
    this.dropGrantsFor(readerId);
    this.events.emit(CREDENTIAL_CHANGED_EVENT, readerId);
    await this.record(readerId, 'reader.revoked', actor, { reason: 'admin' });
  }

  private async fail(request: PairingRequest, reason: PairingFailureReason): Promise<void> {
    if (isTerminal(request)) return;
    request.state = reason === 'cancelled-at-reader' || reason === 'cancelled-by-admin' ? 'cancelled' : 'failed';
    request.failureReason = reason;
    if (reason !== 'cancelled-at-reader') this.send(request, { type: 'failed', reason });
    this.finish(request, reason !== 'cancelled-at-reader');
    await this.record(request.boundReaderId, 'reader.pairing_failed', null, { reason });
  }

  private async expire(request: PairingRequest): Promise<void> {
    if (isTerminal(request)) return;
    request.state = 'expired';
    request.failureReason = 'expired';
    this.send(request, { type: 'failed', reason: 'expired' });
    this.finish(request);
    await this.record(request.boundReaderId, 'reader.pairing_expired', null, { reason: 'timeout' });
  }

  private clearTimers(request: PairingRequest): void {
    if (request.rotationTimer) clearInterval(request.rotationTimer);
    if (request.expiryTimer) clearTimeout(request.expiryTimer);
    request.rotationTimer = null;
    request.expiryTimer = null;
  }

  /** Releases a request that reached a terminal state; closes the connection unless the reader cancelled. */
  private finish(request: PairingRequest, closeConnection = true): void {
    this.clearTimers(request);
    this.limits.releasePending(request.id);
    if (closeConnection) {
      try {
        request.ws.close(1000);
      } catch {
        // already closed
      }
    }
    // Keep the terminal request visible to the admin dialog for a short while.
    setTimeout(() => this.requests.delete(request.id), TERMINAL_VISIBLE_MS).unref();
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

  /** The audit log needs a reader and a responsible person; reader-initiated failures use the device actor. */
  private async record(
    readerId: number | null,
    action:
      | 'reader.enrolled'
      | 'reader.pairing_confirmed'
      | 'reader.pairing_failed'
      | 'reader.pairing_expired'
      | 'reader.revoked'
      | 'reader.replaced',
    actor: Actor | null,
    details: Record<string, string | number>,
  ): Promise<void> {
    if (!readerId) return;
    await this.audit
      .recordAttractap({
        action,
        actorId: actor ? actor.userId : null,
        authenticationMethod: actor ? actor.authenticationMethod : null,
        apiTokenId: actor?.authenticationMethod === 'api-token' ? actor.apiTokenId : undefined,
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

  private view(request: PairingRequest, detail: boolean): PairingView {
    const view: PairingView = {
      id: request.id,
      state: request.state,
      kind: request.kind,
      firmware: request.firmware,
      boundReaderId: request.boundReaderId,
      targetReaderId: request.targetReaderId,
      mode: request.mode,
      createdAt: new Date(request.createdAt),
      expiresAt: new Date(request.expiresAt),
      failureReason: request.failureReason,
    };
    if (detail && request.kind === 'lite') {
      const shown = request.current.derived ? request.current : request.previous;
      view.pattern = shown?.derived?.pattern ?? null;
      view.round = shown?.derived ? shown.round : null;
    }
    return view;
  }

  private mustFind(id: string): PairingRequest {
    const request = this.requests.get(id);
    if (!request) throw new NotFoundException('Pairing not found');
    return request;
  }
}
