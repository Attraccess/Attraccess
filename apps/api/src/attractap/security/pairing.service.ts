import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationShutdown,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import type { WebSocket } from 'ws';
import { AUDIT_RECORDER, AuditRecorder } from '../../audit/recorder/audit-event';
import type { AppConfigType } from '../../config/app.config';
import { resolveClientAddress } from '../../device-enrollment/client-address';
import {
  ENROLLMENT_CODE_ROTATION_MS,
  ENROLLMENT_REQUEST_TTL_MS,
} from '../../device-enrollment/device-enrollment.constants';
import { normalizeEnrollmentCode } from '../../device-enrollment/enrollment-code';
import { EnrollmentLimitsService } from '../../device-enrollment/enrollment-limits.service';
import { SettingsService } from '../../settings/settings.service';
import { AttractapService } from '../attractap.service';
import { BootstrapGrants } from './bootstrap-grants';
import { CredentialRegistryService } from './credential-registry.service';
import { InstallationIdentityService } from './installation-identity.service';
import { PairingApproval } from './pairing-approval';
import { PairingAuditAction, recordPairingEvent } from './pairing-audit';
import { commitment, deriveCode, generateNonce, NONCE_BYTES } from './pairing-protocol';
import {
  Actor,
  ApproveInput,
  BootstrapGrant,
  CREDENTIAL_CHANGED_EVENT,
  PairingFailureReason,
  PairingMethod,
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
const APP_URL_CACHE_MS = ENROLLMENT_CODE_ROTATION_MS;
/** How long a request that ended stays visible to the admin dialog. */
export const TERMINAL_VISIBLE_MS = 60_000;

export { CREDENTIAL_CHANGED_EVENT };

@Injectable()
export class PairingService implements OnApplicationShutdown {
  private readonly logger = new Logger(PairingService.name);
  private readonly requests = new Map<string, PairingRequest>();
  private readonly grants = new BootstrapGrants();
  private readonly approval: PairingApproval;
  /** Closes a pairing connection that has no request and sends no `hello` in time. */
  private readonly helloTimers = new WeakMap<WebSocket, NodeJS.Timeout>();
  private appUrl: { value: string | null; fetchedAt: number } | null = null;
  private readonly createdListeners: Array<(id: string) => void> = [];

  public constructor(
    private readonly attractap: AttractapService,
    private readonly identity: InstallationIdentityService,
    private readonly registry: CredentialRegistryService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly events: EventEmitter2,
    private readonly limits: EnrollmentLimitsService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {
    // Not a provider of its own: it shares the bootstrap grants and runs only inside `approve`.
    this.approval = new PairingApproval(attractap, identity, registry, audit, events, this.grants);
  }

  /** Runs for every new pairing request on this instance (the cluster facade records where it is held). */
  public onRequestCreated(listener: (id: string) => void): void {
    this.createdListeners.push(listener);
  }

  public onApplicationShutdown(): void {
    for (const request of this.requests.values()) this.clearTimers(request);
  }

  // --- reader side -------------------------------------------------------------------------

  /**
   * Listeners are attached right away so an early `hello` is not lost; no message is handled before
   * `admitted` (the Attractap license check) resolves. If it rejects, the connection is closed.
   */
  public handleConnection(ws: WebSocket, request: IncomingMessage, admitted: Promise<void> = Promise.resolve()): void {
    const connectionId = randomUUID();
    // The same validated TRUST_PROXY value the HTTP server uses (main.bootstrap).
    const address = resolveClientAddress(request, this.config.get<AppConfigType>('app')?.TRUST_PROXY);
    let current: PairingRequest | null = null;
    let allowed = true;
    let queue: Promise<void> = admitted.catch(() => {
      allowed = false;
      ws.close(1008, 'license');
    });
    this.armHelloTimeout(ws);

    ws.on('close', () => {
      this.clearHelloTimeout(ws);
      this.limits.forgetConnection(connectionId);
      if (current && !isTerminal(current)) void this.fail(current, 'reader-disconnected');
    });
    ws.on('error', () => undefined);
    ws.on('message', (data: Buffer, isBinary: boolean) => {
      // Messages of one connection are handled strictly one after another.
      queue = queue.then(async () => {
        if (!allowed) return;
        try {
          if (isBinary || data.length > MAX_MESSAGE_BYTES) throw new Error('bad message');
          const message = JSON.parse(data.toString('utf8')) as Record<string, unknown>;
          if (!current || isTerminal(current)) {
            this.clearHelloTimeout(ws);
            current = await this.onHello(ws, connectionId, address, message);
            return;
          }
          await this.onReaderMessage(current, message);
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
      serverPublicKey,
      current: this.newRound(1),
      previous: null,
      nextRotationAt: now + ENROLLMENT_CODE_ROTATION_MS,
      approving: false,
      endRequested: null,
      mode: null,
      targetReaderId: null,
      rotationTimer: null,
      expiryTimer: null,
      failureReason: null,
    };
    request.rotationTimer = setInterval(() => void this.rotate(request), ENROLLMENT_CODE_ROTATION_MS);
    request.expiryTimer = setTimeout(() => void this.expire(request), ENROLLMENT_REQUEST_TTL_MS);
    request.rotationTimer.unref?.();
    request.expiryTimer.unref?.();
    this.requests.set(id, request);
    for (const listener of this.createdListeners) listener(id);
    await this.announceRound(request);
    // The close handler only knows the request once this returns; a reader that left while the
    // first round was being prepared must not leave a request behind that holds its limits.
    if (ws.readyState !== ws.OPEN) await this.fail(request, 'reader-disconnected');
    return request;
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
  public async resolve(rawCode: string, actor: Actor): Promise<PairingView> {
    return resolveCodeAmong(this.limits, actor, async () => this.matching(rawCode).map((r) => this.view(r, false)));
  }

  /** The waiting readers on this instance that show this code. Counts nothing: the caller decides what is wrong. */
  public matchCode(rawCode: string): PairingView[] {
    return this.matching(rawCode).map((request) => this.view(request, false));
  }

  /**
   * The one admin action: checks the code or pattern, then enrolls and pairs in one go. `matchesElsewhere`: how many
   * waiting readers on other API instances show `input.code` (the cluster facade asks them).
   */
  public async approve(id: string, input: ApproveInput, actor: Actor, matchesElsewhere = 0): Promise<PairingView> {
    const attempt = await this.limits.beginApproverAttempt(actor.userId);
    let method: PairingMethod | null;
    let request: PairingRequest;
    try {
      request = this.mustFind(id);
      if (isTerminal(request) || request.approving) throw new ConflictException('PairingNotWaiting');
      method = this.verifyProof(request, input, matchesElsewhere);
    } catch (error) {
      await attempt.notWrong();
      throw error;
    }
    if (!method) {
      await attempt.wrong();
      throw new NotFoundException('PairingCodeNotFound');
    }
    // A correct code does not reset the wrong-code count; it runs out with its window.

    // Claimed before the first await so concurrent approvals cannot both pass the guards above.
    // While it is set, a disconnect, cancel or expiry only records that the request should end.
    request.approving = true;
    try {
      await attempt.notWrong();
      const readerId = await this.approval.run(request, input, method, actor);
      request.state = 'completed';
      request.mode = input.mode;
      request.targetReaderId = readerId;
      this.finish(request);
    } finally {
      request.approving = false;
      const ending = request.endRequested;
      request.endRequested = null;
      if (ending && !isTerminal(request)) await this.end(request, ending.reason, ending.actor, ending.audited);
    }
    return this.view(request, true);
  }

  public async cancel(id: string, actor: Actor): Promise<void> {
    const request = this.mustFind(id);
    await this.fail(request, 'cancelled-by-admin', actor);
  }

  private matching(rawCode: string): PairingRequest[] {
    const code = normalizeEnrollmentCode(rawCode ?? '');
    return code ? [...this.requests.values()].filter((r) => !isTerminal(r) && this.codeMatches(r, code)) : [];
  }

  private codeMatches(request: PairingRequest, code: string): boolean {
    return roundsOf(request).some((round) => round.derived?.code === code);
  }

  /**
   * Throws unless the admin proved they compared the right reader; returns how they did it, or null for a code that
   * is not this reader's (a wrong code). Synchronous, so nothing runs between the guards and claiming the approval.
   */
  private verifyProof(request: PairingRequest, input: ApproveInput, matchesElsewhere: number): PairingMethod | null {
    if (input.code !== undefined) {
      const matches = this.matching(input.code);
      if (matches.length + matchesElsewhere > 1) throw new ConflictException('PairingCodeAmbiguous');
      if (matches[0] !== request) return null;
      return input.via === 'flasher' ? 'flasher' : 'code';
    }
    if (input.round === undefined || request.kind !== 'lite') throw new BadRequestException('CodeRequired');
    const round = roundsOf(request).find((candidate) => candidate.round === input.round);
    if (!round?.derived) throw new ConflictException('PairingRoundStale');
    return 'led-pattern';
  }

  // --- bootstrap and lifecycle -------------------------------------------------------------

  public async resolveBootstrap(peer: { spkiFingerprint: string; spki: Buffer }): Promise<BootstrapGrant | null> {
    const fingerprint = peer.spkiFingerprint;
    const cached = this.grants.get(fingerprint);
    if (cached && (await this.registry.isActive(cached.readerId, fingerprint))) {
      return { readerId: cached.readerId, certificatePem: cached.certificatePem };
    }
    this.grants.forget(fingerprint);

    const readerId = await this.registry.findPairedReaderByFingerprint(fingerprint);
    if (!readerId) return null;
    const certificate = await this.identity.issueReaderCertificate(readerId, peer.spki);
    await this.registry.recordCertificate(readerId, fingerprint, certificate);
    return { readerId, certificatePem: certificate.pem };
  }

  /** The reader opened a normal session with its certificate: the bootstrap grant is spent. */
  public forgetGrant(keyFingerprint: string): void {
    this.grants.forget(keyFingerprint);
  }

  /** Revoke: the credential stops working immediately and the live session ends. */
  public async revoke(readerId: number, actor: Actor): Promise<void> {
    await this.registry.revoke(readerId, actor.userId);
    this.grants.forgetReader(readerId);
    this.events.emit(CREDENTIAL_CHANGED_EVENT, readerId);
    await this.record(readerId, 'reader.revoked', actor, { reason: 'admin' });
  }

  /** Ends a request; while an approval runs, only notes it so the approval can stop or apply it. */
  private async fail(request: PairingRequest, reason: PairingFailureReason, actor: Actor | null = null): Promise<void> {
    if (isTerminal(request)) return;
    if (request.approving) {
      request.endRequested ??= { reason, actor };
      return;
    }
    await this.end(request, reason, actor);
  }

  private async expire(request: PairingRequest): Promise<void> {
    await this.fail(request, 'expired');
  }

  /** `audited`: the approval already recorded why the request ends. */
  private async end(
    request: PairingRequest,
    reason: PairingFailureReason,
    actor: Actor | null,
    audited = false,
  ): Promise<void> {
    if (isTerminal(request)) return;
    request.failureReason = reason;
    if (reason === 'expired') {
      request.state = 'expired';
      this.send(request, { type: 'failed', reason });
      this.finish(request);
      await this.record(request.targetReaderId, 'reader.pairing_expired', null, { reason: 'timeout' });
      return;
    }
    request.state = reason === 'cancelled-at-reader' || reason === 'cancelled-by-admin' ? 'cancelled' : 'failed';
    if (reason !== 'cancelled-at-reader') this.send(request, { type: 'failed', reason });
    this.finish(request, reason !== 'cancelled-at-reader');
    if (!audited) await this.record(request.targetReaderId, 'reader.pairing_failed', actor, { reason });
  }

  private clearTimers(request: PairingRequest): void {
    if (request.rotationTimer) clearInterval(request.rotationTimer);
    if (request.expiryTimer) clearTimeout(request.expiryTimer);
    request.rotationTimer = null;
    request.expiryTimer = null;
  }

  /**
   * Releases a request that reached a terminal state. Closes the connection unless the reader
   * cancelled; then it may send a new `hello`, within the usual time.
   */
  private finish(request: PairingRequest, closeConnection = true): void {
    this.clearTimers(request);
    this.limits.releasePending(request.id);
    if (!closeConnection) {
      this.armHelloTimeout(request.ws);
    } else {
      try {
        request.ws.close(1000);
      } catch {
        // already closed
      }
    }
    // Keep the terminal request visible to the admin dialog for a short while.
    setTimeout(() => this.requests.delete(request.id), TERMINAL_VISIBLE_MS).unref();
  }

  private armHelloTimeout(ws: WebSocket): void {
    this.clearHelloTimeout(ws);
    if (ws.readyState !== ws.OPEN) return;
    this.helloTimers.set(
      ws,
      setTimeout(() => ws.close(1008, 'hello timeout'), HELLO_TIMEOUT_MS),
    );
  }

  private clearHelloTimeout(ws: WebSocket): void {
    clearTimeout(this.helloTimers.get(ws));
    this.helloTimers.delete(ws);
  }

  // --- helpers -----------------------------------------------------------------------------

  private record(
    readerId: number | null,
    action: PairingAuditAction,
    actor: Actor | null,
    details: Record<string, string | number>,
  ): Promise<void> {
    return recordPairingEvent(this.audit, readerId, action, actor, details);
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

/**
 * One approver attempt at a code over `findMatches` (this instance's waiting readers, or every instance's): a miss
 * counts as a wrong code; a code two readers show is not one, the admin just waits for the next.
 */
export async function resolveCodeAmong(
  limits: Pick<EnrollmentLimitsService, 'beginApproverAttempt'>,
  actor: Actor,
  findMatches: () => Promise<PairingView[]>,
): Promise<PairingView> {
  const attempt = await limits.beginApproverAttempt(actor.userId);
  let matches: PairingView[];
  try {
    matches = await findMatches();
  } catch (error) {
    await attempt.notWrong();
    throw error;
  }
  if (matches.length === 0) {
    await attempt.wrong();
    throw new NotFoundException('PairingCodeNotFound');
  }
  await attempt.notWrong();
  if (matches.length > 1) throw new ConflictException('PairingCodeAmbiguous');
  return matches[0];
}
