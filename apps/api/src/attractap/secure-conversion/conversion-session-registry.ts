import { Injectable } from '@nestjs/common';
import type { SessionSecurityState } from '../security/session-security-state';
import type { PreflightReport } from './conversion-messages';

/** One live session of a paired reader, as far as the conversion needs it. */
export interface ConversionSession {
  readonly state: SessionSecurityState;
  /** Sends one CONTROL message; false when the session is closed or its queue is full. */
  send(message: Record<string, unknown>): boolean;
}

interface PreflightWaiter {
  resolve: (report: PreflightReport | null) => void;
}

/**
 * The paired readers that are online now, by reader id, and the admin preflights waiting for a reader's answer.
 * Sessions register in ReaderControlService; a newer session of the same reader replaces the older one.
 */
@Injectable()
export class ConversionSessionRegistry {
  private readonly sessions = new Map<number, ConversionSession>();
  private readonly preflights = new Map<number, PreflightWaiter[]>();

  public register(session: ConversionSession): void {
    this.sessions.set(session.state.readerId, session);
  }

  /** True when `session` was the reader's current session (and is now gone). */
  public unregister(session: ConversionSession): boolean {
    if (this.sessions.get(session.state.readerId) !== session) return false;
    this.sessions.delete(session.state.readerId);
    return true;
  }

  public get(readerId: number): ConversionSession | null {
    return this.sessions.get(readerId) ?? null;
  }

  public isOnline(readerId: number): boolean {
    return this.sessions.has(readerId);
  }

  /** Resolves with the next preflight report of the reader, or null after `timeoutMs`. */
  public awaitPreflight(readerId: number, timeoutMs: number): Promise<PreflightReport | null> {
    return new Promise((resolve) => {
      const waiter: PreflightWaiter = {
        resolve: (report) => {
          clearTimeout(timer);
          const left = (this.preflights.get(readerId) ?? []).filter((w) => w !== waiter);
          if (left.length) this.preflights.set(readerId, left);
          else this.preflights.delete(readerId);
          resolve(report);
        },
      };
      const timer = setTimeout(() => waiter.resolve(null), timeoutMs);
      timer.unref();
      this.preflights.set(readerId, [...(this.preflights.get(readerId) ?? []), waiter]);
    });
  }

  /** Hands a preflight report to everyone waiting for this reader. */
  public deliverPreflight(readerId: number, report: PreflightReport): void {
    for (const waiter of [...(this.preflights.get(readerId) ?? [])]) waiter.resolve(report);
  }
}
