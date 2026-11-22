// Follows the plugin's commissioning sessions on the sidecar: progress events, polling, restarts of either side, and
// sidecar sessions the plugin lost track of (orphans). Terminal outcomes are handed to the settlement.
import type { CommissioningSession } from '@attraccess/matter-contract';
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SidecarConnection } from '../client/connection';
import { SidecarClientError } from '../client/errors';
import type { StreamEvent } from '../client/event-stream';
import type { InterruptReason } from '../connection/audit';
import type { StartInput } from './schemas';
import { isActive, type Session } from './session';
import type { CommissioningSettlement } from './settlement';

export const COMMISSIONING_TIMING = Symbol.for('attraccess.matter.commissioning-timing');
export type CommissioningTiming = {
  /** How often the sidecar is asked about a running session, besides its events. */
  pollMs: number;
  /** Longest a session may run: the sidecar's own deadline plus a margin. Then it ends as `interrupted`. */
  maxMs: number;
  /** Polls in a row that cannot reach the sidecar before the session ends as `interrupted`. */
  maxUnreachablePolls: number;
  /** How long a finished session stays readable. */
  retainMs: number;
};
export const DEFAULT_TIMING: CommissioningTiming = {
  pollMs: 1_500,
  maxMs: 7 * 60_000,
  maxUnreachablePolls: 4,
  retainMs: 3_600_000,
};

/** How long a cancelled orphan may take to end on the sidecar before the start is tried again anyway. */
const ORPHAN_WAIT_MS = 15_000;

export type TrackerDeps = {
  connection: () => SidecarConnection;
  settlement: CommissioningSettlement;
  timing: CommissioningTiming;
  warn: (message: string) => void;
};

export class CommissioningSessionTracker {
  readonly sessions = new Map<string, Session>();
  private timer: NodeJS.Timeout | undefined;
  private polling = false;
  private streamInstanceId: string | null = null;
  /** Sidecar sessions this plugin did not start (it restarted since), already handled. */
  private readonly orphans = new Set<string>();
  private startsInFlight = 0;

  constructor(private readonly deps: TrackerDeps) {}

  private get settlement() {
    return this.deps.settlement;
  }

  get currentStreamInstanceId(): string | null {
    return this.streamInstanceId;
  }

  /** Subscribes to the connection. Returns the functions that unsubscribe. */
  listen(): (() => void)[] {
    const connection = this.deps.connection();
    return [
      connection.onEvent((event) => this.onEvent(event)),
      connection.onStateChange((status) => {
        if (status.state === 'connected') void this.settlement.flushCancels();
        else this.interruptAll('connection_lost');
      }),
    ];
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** A session that just started: kept, and followed until it ends. */
  track(session: Session): void {
    this.prune();
    this.sessions.set(session.id, session);
    this.startPolling();
  }

  owned(id: string, userId: number): Session {
    const session = this.sessions.get(id);
    if (!session || session.userId !== userId) throw new NotFoundException('Unknown commissioning session.');
    return session;
  }

  /** Running sessions whose outcome is not being handled yet. */
  activeSessions(): Session[] {
    return [...this.sessions.values()].filter((session) => isActive(session) && !session.settling);
  }

  // --- starting, and the sessions of an earlier plugin run -------------------------------------------------------

  /**
   * Asks the sidecar to start. A session the plugin no longer follows may hold the sidecar's gate: one of an earlier
   * plugin run, or one the plugin already ended (interrupted) whose cancel did not reach the sidecar. It is cancelled
   * (nothing resumes) and the start is tried once more. Only one of an earlier run is audited, as `plugin_restart`.
   */
  async requestStart(input: StartInput): Promise<CommissioningSession> {
    const body = {
      setupCode: input.setupCode,
      ...(input.attestationOverride ? { attestationOverride: input.attestationOverride } : {}),
    };
    const connection = this.deps.connection();
    this.startsInFlight += 1;
    try {
      try {
        return await connection.request('commissioning.start', { body });
      } catch (error) {
        const orphan = this.orphanOf(error);
        if (orphan === null) throw error;
        await this.cancelOrphan(orphan.id, orphan.known);
        return await connection.request('commissioning.start', { body });
      }
    } finally {
      this.startsInFlight -= 1;
    }
  }

  /** The sidecar session a `busy` refusal points at, when the plugin does not follow it; null for any other cause. */
  private orphanOf(error: unknown): { id: string; known: boolean } | null {
    if (!(error instanceof SidecarClientError) || error.code !== 'busy') return null;
    const id = error.details?.sessionId;
    if (typeof id !== 'string' || this.activeSessions().length > 0) return null;
    const known = [...this.sessions.values()].find((entry) => entry.sidecarSessionId === id);
    if (known && isActive(known)) return null;
    return { id, known: known !== undefined };
  }

  private async cancelOrphan(sidecarSessionId: string, known: boolean): Promise<void> {
    // A session the plugin ended itself was audited then; only one of an earlier plugin run is audited here.
    if (!known) await this.noteOrphan(sidecarSessionId);
    const connection = this.deps.connection();
    await connection.request('commissioning.cancel', { params: { sessionId: sidecarSessionId } });
    const deadline = Date.now() + ORPHAN_WAIT_MS;
    for (;;) {
      const state = await connection
        .request('commissioning.get', { params: { sessionId: sidecarSessionId } })
        .then((view) => view.state)
        .catch(() => 'failed');
      if (state !== 'pending' && state !== 'running') return;
      if (Date.now() > deadline) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  /** A session of the sidecar this plugin has no record of: it was lost with a restart. Audited once. */
  private async noteOrphan(sidecarSessionId: string): Promise<void> {
    if (this.orphans.has(sidecarSessionId)) return;
    this.orphans.add(sidecarSessionId);
    await this.settlement.record('matter.commissioning_interrupted', null, { reason: 'plugin_restart' }, randomUUID());
  }

  // --- following ----------------------------------------------------------------------------------------------------

  private onEvent({ event }: StreamEvent): void {
    const previous = this.streamInstanceId;
    this.streamInstanceId = event.streamInstanceId;
    if (previous !== null && previous !== event.streamInstanceId) {
      // Another sidecar run: whatever it was commissioning is gone with its memory.
      this.interruptAll('sidecar_restart');
    }
    for (const session of this.activeSessions()) session.streamInstanceId ??= event.streamInstanceId;
    if (event.type !== 'commissioning.progress') return;
    const payload = event.payload as { sessionId?: string; state?: string };
    const session = [...this.sessions.values()].find((entry) => entry.sidecarSessionId === payload.sessionId);
    if (session) {
      if (isActive(session) && !session.settling) this.background(this.refresh(session));
      // The plugin ended the session (interrupted), yet it completed on the sidecar: the node surfaces as unclaimed.
      else if (session.state === 'interrupted' && payload.state === 'succeeded')
        this.settlement.requestReconciliation();
    } else if (payload.sessionId && this.startsInFlight === 0) {
      // A session this plugin does not know (it restarted meanwhile): nothing resumes, and a node it completed
      // surfaces as unclaimed.
      this.background(this.noteOrphan(payload.sessionId));
      if (payload.state === 'succeeded') this.settlement.requestReconciliation();
    }
  }

  private startPolling(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.background(this.poll()), this.deps.timing.pollMs);
    this.timer.unref();
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (const session of this.activeSessions()) {
        try {
          if (Date.now() - Date.parse(session.startedAt) > this.deps.timing.maxMs) {
            // The settlement cancels it on the sidecar as well.
            await this.settlement.interrupt(session, 'timeout');
          } else {
            await this.refresh(session);
          }
        } catch (error) {
          this.deps.warn(`A Matter commissioning session could not be followed: ${describe(error)}`);
        }
      }
    } finally {
      this.polling = false;
      if (![...this.sessions.values()].some(isActive)) this.stop();
    }
  }

  /** Reads the session from the sidecar. `not_found` means the sidecar restarted since it started the session. */
  async refresh(session: Session): Promise<void> {
    if (!isActive(session) || session.settling) return;
    let sidecar: CommissioningSession;
    try {
      sidecar = await this.deps
        .connection()
        .request('commissioning.get', { params: { sessionId: session.sidecarSessionId } });
    } catch (error) {
      if (error instanceof SidecarClientError && error.code === 'not_found') {
        return this.settlement.interrupt(session, 'sidecar_restart');
      }
      session.unreachable += 1;
      if (session.unreachable >= this.deps.timing.maxUnreachablePolls) {
        return this.settlement.interrupt(session, 'connection_lost');
      }
      return;
    }
    session.unreachable = 0;
    await this.settlement.apply(session, sidecar);
  }

  interruptAll(reason: InterruptReason): Promise<void>[] {
    return this.activeSessions().map((session) => {
      const done = this.settlement.interrupt(session, reason);
      this.background(done);
      return done;
    });
  }

  /** Work nobody awaits must never end as an unhandled rejection (an audit or database error, for example). */
  private background(work: Promise<void>): void {
    work.catch((error: unknown) =>
      this.deps.warn(`A Matter commissioning session could not be followed: ${describe(error)}`),
    );
  }

  private prune(): void {
    const limit = Date.now() - this.deps.timing.retainMs;
    for (const [id, session] of this.sessions) {
      if (session.finishedAt !== null && Date.parse(session.finishedAt) < limit) this.sessions.delete(id);
    }
  }
}

const describe = (error: unknown): string => (error instanceof Error ? error.name : 'unknown error');
