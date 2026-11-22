import {
  commissioningSessionSchema,
  type CommissioningFailure,
  type CommissioningProgressPayload,
  type CommissioningSession,
} from '@attraccess/matter-contract';
import { Seconds } from '@matter/main';
import { DclCertificateService, type AttestationFinding } from '@matter/main/protocol';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../api-error';
import type { FabricManager } from '../fabric/manager';
import type { Logger } from '../logger';
import { recordAttestation } from '../inventory/node-meta';
import { decodeSetupCode, type DecodedSetupCode } from './code';
import { classifyFailure, errorNames } from './failure';
import { CommissioningCancelledError, createCommissioningFlow, type ProgressStep } from './flow';
import type { AttestationTrust } from './trust';

/** Overall budget of one attempt. Inside the device's own fail-safe limits: the CASE reconnect is capped separately. */
export const DEFAULT_COMMISSIONING_DEADLINE_MS = 5 * 60_000;
/** The longest the first CASE session may take (matter.js allows the device's fail-safe window for it). */
const MAX_CASE_SECONDS = 255;
const MIN_CASE_SECONDS = 30;
/** Time the sidecar waits for the new node to report its structure before it answers `succeeded` anyway. */
const INTERROGATION_WAIT_MS = 30_000;
/** Discovery and PASE: a device that does not answer within this long is not on the network (or the code is wrong). */
const DISCOVERY_TIMEOUT_MS = 60_000;
const KEPT_SESSIONS = 20;

/** Seams for tests. Not reachable from the environment or HTTP. */
export type CommissioningTuning = {
  deadlineMs?: number;
  /** Budget for discovery and PASE (matter.js defaults to 30 s). */
  discoveryTimeoutMs?: number;
  /** Finding types a test accepts as `verified` (the virtual device chains to a matter.js test PAA). */
  tolerateFindings?: readonly string[];
};

export type CommissioningServiceOptions = {
  manager: FabricManager;
  trust: AttestationTrust;
  logger: Logger;
  allowAttestationOverride: boolean;
  /** Publishes a `commissioning.progress` event. */
  publish: (payload: CommissioningProgressPayload) => void;
  tuning?: CommissioningTuning;
};

type Running = {
  view: CommissioningSession;
  abort: AbortController;
  override: boolean;
  cancelRequested: boolean;
  deadlineExpired: boolean;
  attestationFailed: boolean;
  findings: string[];
};

const uniqueTypes = (findings: readonly AttestationFinding[]) => [...new Set(findings.map((finding) => finding.type))];

/**
 * Commissions IP-reachable devices into the Attraccess fabric. One attempt at a time, through the fabric manager's
 * single-flight gate. Sessions live in memory only and hold no secret: the setup code goes into matter.js and nowhere else.
 */
export class CommissioningService {
  readonly #sessions = new Map<string, Running>();

  constructor(private readonly options: CommissioningServiceOptions) {}

  get(sessionId: string): CommissioningSession {
    return this.#find(sessionId).view;
  }

  cancel(sessionId: string): CommissioningSession {
    const session = this.#find(sessionId);
    if (session.view.state === 'pending' || session.view.state === 'running') {
      session.cancelRequested = true;
      session.abort.abort();
    }
    return session.view;
  }

  /** Starts a session and returns it at once; the run continues in the background and reports by events. */
  start(request: { setupCode: string; attestationOverride?: { confirmed: true } }): CommissioningSession {
    const override = request.attestationOverride?.confirmed === true;
    if (override && !this.options.allowAttestationOverride) {
      throw new ApiError(
        'attestation_override_disabled',
        'The attestation override is not enabled on this sidecar (MATTER_SIDECAR_ALLOW_ATTESTATION_OVERRIDE).',
      );
    }
    const status = this.options.manager.status();
    if (status.state === 'recovery_required') {
      throw new ApiError('recovery_required', 'The Matter storage needs recovery; devices cannot be commissioned.', {
        reason: status.reason,
      });
    }
    if (status.state === 'uninitialized') throw new ApiError('fabric_absent', 'There is no fabric to commission into.');
    const session = this.#create(override);
    const decoded = decodeSetupCode(request.setupCode);
    if (!decoded) {
      this.#fail(session, { code: 'invalid_code' });
      return session.view;
    }
    // Throws `busy` at once when a snapshot, restore, removal, share or commissioning holds the gate.
    this.options.manager
      .beginExclusive(() => this.#run(session, decoded))
      .catch(() => this.#fail(session, { code: 'internal' }));
    return session.view;
  }

  #find(sessionId: string): Running {
    const session = this.#sessions.get(sessionId);
    if (!session) throw new ApiError('not_found', 'There is no such commissioning session.');
    return session;
  }

  #create(override: boolean): Running {
    const now = new Date().toISOString();
    const session: Running = {
      view: {
        sessionId: randomUUID(),
        state: 'pending',
        step: null,
        nodeId: null,
        outcome: 'requested',
        failure: null,
        attestation: null,
        attestationOverrideAllowed: this.options.allowAttestationOverride,
        startedAt: now,
        updatedAt: now,
        finishedAt: null,
      },
      abort: new AbortController(),
      override,
      cancelRequested: false,
      deadlineExpired: false,
      attestationFailed: false,
      findings: [],
    };
    this.#sessions.set(session.view.sessionId, session);
    this.#prune();
    return session;
  }

  /** Keeps the most recent sessions; a running one is never dropped. */
  #prune() {
    for (const [id, session] of this.#sessions) {
      if (this.#sessions.size <= KEPT_SESSIONS) return;
      if (session.view.state === 'succeeded' || session.view.state === 'failed') this.#sessions.delete(id);
    }
  }

  #update(session: Running, patch: Partial<Omit<CommissioningSession, 'sessionId'>>) {
    const { view } = session;
    if (view.state === 'succeeded' || view.state === 'failed') return;
    Object.assign(view, patch, { updatedAt: new Date().toISOString() });
    const parsed = commissioningSessionSchema.safeParse(view);
    if (!parsed.success)
      this.options.logger('error', 'commissioning session is invalid', { sessionId: view.sessionId });
    try {
      this.options.publish({
        sessionId: view.sessionId,
        step: view.step,
        state: view.state,
        nodeId: view.nodeId,
        failure: view.failure,
      });
    } catch {
      // A broken event stream never fails commissioning.
    }
  }

  #step(session: Running, step: ProgressStep) {
    if (session.abort.signal.aborted) throw new CommissioningCancelledError();
    this.#update(session, { state: 'running', step, outcome: 'accepted' });
  }

  #fail(session: Running, failure: CommissioningFailure) {
    const finishedAt = new Date().toISOString();
    this.#update(session, { state: 'failed', outcome: 'failed', failure, finishedAt });
    // `#update` ignores a finished session, so a late call cannot overwrite the first outcome.
    this.options.logger('info', 'commissioning failed', { sessionId: session.view.sessionId, code: failure.code });
  }

  async #run(session: Running, code: DecodedSetupCode): Promise<void> {
    const { manager, tuning } = this.options;
    const deadlineMs = tuning?.deadlineMs ?? DEFAULT_COMMISSIONING_DEADLINE_MS;
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      session.deadlineExpired = true;
      session.abort.abort();
    }, deadlineMs);
    timer.unref();
    try {
      const controller = manager.controller;
      if (!controller) throw new ApiError('sidecar_unavailable', 'The Matter controller is not running.');
      this.#update(session, { state: 'running', step: 'discovering', outcome: 'accepted' });
      const trust = await this.options.trust.service();
      const node = controller.serverNode;
      node.env.set(DclCertificateService, trust);
      const caseSeconds = Math.max(
        MIN_CASE_SECONDS,
        Math.min(MAX_CASE_SECONDS, Math.floor((deadlineMs - (Date.now() - startedAt)) / 1000) - 30),
      );
      const peer = await node.peers.commission({
        ...code,
        timeout: Seconds(Math.ceil((tuning?.discoveryTimeoutMs ?? DISCOVERY_TIMEOUT_MS) / 1000)),
        abort: session.abort.signal,
        caseConnectionTimeout: Seconds(caseSeconds),
        commissioningFlowImpl: createCommissioningFlow({
          onPaseEstablished: () => this.#step(session, 'pase'),
          onStep: (step) => this.#step(session, step),
          onAttestationPassed: () => {
            if (session.view.attestation === null || session.view.attestation.status === 'verified') {
              this.#update(session, {
                attestation: { status: 'verified', findings: session.view.attestation?.findings ?? [] },
              });
            }
          },
        }),
        onAttestationFailure: (findings) => this.#judgeAttestation(session, findings),
      });
      const nodeId = String(peer.state.commissioning.peerAddress?.nodeId);
      this.#update(session, { step: 'interrogating', nodeId });
      await this.#waitUntilKnown(peer, session.abort.signal);
      this.#finish(session, nodeId);
    } catch (error) {
      // Class names only: an error message could carry whatever matter.js put in it.
      this.options.logger('info', 'commissioning error', {
        sessionId: session.view.sessionId,
        errors: errorNames(error),
      });
      this.#fail(
        session,
        classifyFailure(error, {
          step: session.view.step,
          cancelRequested: session.cancelRequested,
          deadlineExpired: session.deadlineExpired,
          attestationFailed: session.attestationFailed,
          attestationFindings: session.findings,
        }),
      );
    } finally {
      clearTimeout(timer);
      this.options.manager.controller?.serverNode.env.delete(DclCertificateService);
    }
  }

  /** Strict policy: any error-level finding fails, unless this session carries the confirmed override. */
  #judgeAttestation(session: Running, findings: AttestationFinding[]): boolean {
    const tolerated = new Set(this.options.tuning?.tolerateFindings ?? []);
    const types = uniqueTypes(findings);
    const blocking = findings.filter((finding) => finding.level === 'error' && !tolerated.has(finding.type));
    session.findings = types;
    if (blocking.length === 0) {
      this.#update(session, { attestation: { status: 'verified', findings: types } });
      return true;
    }
    if (session.override) {
      this.options.logger('warn', 'attestation failed; continuing because the override was confirmed', {
        sessionId: session.view.sessionId,
        findings: uniqueTypes(blocking),
      });
      this.#update(session, { attestation: { status: 'overridden', findings: types } });
      return true;
    }
    session.attestationFailed = true;
    this.#update(session, { attestation: { status: 'failed', findings: types } });
    return false;
  }

  #finish(session: Running, nodeId: string) {
    const { manager } = this.options;
    // Kept with the fabric storage, so a backup carries it. `inventory.*` reads it back as the node's attestation.
    recordAttestation(manager.layout, nodeId, {
      status: session.view.attestation?.status === 'overridden' ? 'unverified' : 'verified',
      checkedAt: new Date().toISOString(),
    });
    manager.commitFabricChange();
    this.#update(session, {
      state: 'succeeded',
      step: 'completed',
      outcome: 'reported',
      nodeId,
      finishedAt: new Date().toISOString(),
    });
    this.options.logger('info', 'commissioning succeeded', { sessionId: session.view.sessionId });
  }

  /** The node is in the fabric; give it a moment to report its structure so the inventory is ready. Never fails the session. */
  async #waitUntilKnown(peer: { lifecycle: { isOnline: boolean } }, signal: AbortSignal) {
    const deadline = Date.now() + INTERROGATION_WAIT_MS;
    while (!peer.lifecycle.isOnline && Date.now() < deadline && !signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
