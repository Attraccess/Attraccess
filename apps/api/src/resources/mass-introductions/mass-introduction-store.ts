import type {
  MassIntroductionIntroducer,
  MassIntroductionParticipant,
  MassIntroductionReader,
  MassIntroductionTarget,
} from './mass-introduction.types';
import { MassIntroductionReaderState } from './dtos/massIntroductionSession.dto';

/** A running session as the store keeps it: plain data, the same on every API instance. */
export interface StoredMassIntroduction {
  id: string;
  publicId: string;
  /** TOTP secret behind the rotating code. Never leaves the server. */
  codeSecret: string;
  target: MassIntroductionTarget;
  introducer: MassIntroductionIntroducer;
  reader: MassIntroductionReader | null;
  createdAt: number;
  expiresAt: number;
}

/**
 * Where mass-introduction sessions live: in this process (one API instance) or in Valkey (several, ATT-1163).
 * Operations that decide something (ending, attaching the reader, joining) are atomic in either.
 */
export interface MassIntroductionStore {
  create(session: StoredMassIntroduction): Promise<void>;
  get(sessionId: string): Promise<StoredMassIntroduction | null>;
  getByPublicId(publicId: string): Promise<StoredMassIntroduction | null>;
  /** The introducer's running sessions for one target. */
  findForIntroducer(
    introducerId: number,
    target: Pick<MassIntroductionTarget, 'type' | 'id'>,
  ): Promise<StoredMassIntroduction[]>;
  /** Removes the session; only the one caller that removed it gets it back, so a session ends exactly once. */
  remove(sessionId: string): Promise<StoredMassIntroduction | null>;
  /** Binds the armed reader; false when the session ended meanwhile. */
  attachReader(sessionId: string, reader: MassIntroductionReader): Promise<boolean>;
  /** Marks the reader DETACHED; the session when it changed, null when it was not attached (or is gone). */
  detachReader(sessionId: string, readerId: number): Promise<StoredMassIntroduction | null>;
  participants(sessionId: string): Promise<MassIntroductionParticipant[]>;
  participant(sessionId: string, userId: number): Promise<MassIntroductionParticipant | null>;
  /**
   * Grants at most once per user and session: the first caller runs `grant` and records its participant, a
   * concurrent caller waits for that result. A grant that throws records nothing, so the user may try again.
   * `added` is false for everyone but the caller that recorded the participant.
   */
  joinOnce(
    sessionId: string,
    userId: number,
    grant: () => Promise<MassIntroductionParticipant>,
  ): Promise<{ participant: MassIntroductionParticipant; added: boolean }>;
  /** Reserves one code check for the user; false when they used up their wrong codes for this minute. */
  tryCodeAttempt(sessionId: string, userId: number, nowMs: number): Promise<boolean>;
  codeAttemptFailed(sessionId: string, userId: number, nowMs: number): Promise<void>;
  codeAttemptSucceeded(sessionId: string, userId: number): Promise<void>;
}

export const WRONG_CODE_WINDOW_MS = 60_000;

/** One API instance: the maps the service always had. */
export class InMemoryMassIntroductionStore implements MassIntroductionStore {
  private readonly sessions = new Map<string, StoredMassIntroduction>();
  private readonly idsByPublicId = new Map<string, string>();
  private readonly participantsBySession = new Map<string, Map<number, MassIntroductionParticipant>>();
  private readonly joining = new Map<string, Promise<{ participant: MassIntroductionParticipant; added: boolean }>>();
  private readonly wrongCodes = new Map<string, { windowStart: number; count: number }>();

  constructor(private readonly maxWrongCodes: number) {}

  // Each method changes the maps before its first await, so callers see the change right away.

  async create(session: StoredMassIntroduction): Promise<void> {
    this.sessions.set(session.id, session);
    this.idsByPublicId.set(session.publicId, session.id);
    this.participantsBySession.set(session.id, new Map());
  }

  async get(sessionId: string): Promise<StoredMassIntroduction | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async getByPublicId(publicId: string): Promise<StoredMassIntroduction | null> {
    return this.sessions.get(this.idsByPublicId.get(publicId) ?? '') ?? null;
  }

  async findForIntroducer(
    introducerId: number,
    target: Pick<MassIntroductionTarget, 'type' | 'id'>,
  ): Promise<StoredMassIntroduction[]> {
    return Array.from(this.sessions.values()).filter(
      (session) =>
        session.introducer.id === introducerId &&
        session.target.type === target.type &&
        session.target.id === target.id,
    );
  }

  async remove(sessionId: string): Promise<StoredMassIntroduction | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    this.sessions.delete(sessionId);
    this.idsByPublicId.delete(session.publicId);
    this.participantsBySession.delete(sessionId);
    for (const key of this.wrongCodes.keys()) if (key.startsWith(`${sessionId}|`)) this.wrongCodes.delete(key);
    return session;
  }

  async attachReader(sessionId: string, reader: MassIntroductionReader): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.reader = { ...reader };
    return true;
  }

  async detachReader(sessionId: string, readerId: number): Promise<StoredMassIntroduction | null> {
    const session = this.sessions.get(sessionId);
    if (!session?.reader || session.reader.id !== readerId) return null;
    if (session.reader.state === MassIntroductionReaderState.DETACHED) return null;
    session.reader.state = MassIntroductionReaderState.DETACHED;
    return session;
  }

  async participants(sessionId: string): Promise<MassIntroductionParticipant[]> {
    return Array.from(this.participantsBySession.get(sessionId)?.values() ?? []);
  }

  async participant(sessionId: string, userId: number): Promise<MassIntroductionParticipant | null> {
    return this.participantsBySession.get(sessionId)?.get(userId) ?? null;
  }

  joinOnce(
    sessionId: string,
    userId: number,
    grant: () => Promise<MassIntroductionParticipant>,
  ): Promise<{ participant: MassIntroductionParticipant; added: boolean }> {
    const existing = this.participantsBySession.get(sessionId)?.get(userId);
    if (existing) return Promise.resolve({ participant: existing, added: false });
    const key = `${sessionId}|${userId}`;
    const inFlight = this.joining.get(key);
    if (inFlight) return inFlight.then(({ participant }) => ({ participant, added: false }));
    const joining = (async () => {
      try {
        const participant = await grant();
        // A session that ended while granting keeps the grant but has no one left to notify.
        const participants = this.participantsBySession.get(sessionId);
        participants?.set(userId, participant);
        return { participant, added: participants !== undefined };
      } finally {
        this.joining.delete(key);
      }
    })();
    this.joining.set(key, joining);
    return joining;
  }

  async tryCodeAttempt(sessionId: string, userId: number, nowMs: number): Promise<boolean> {
    const key = `${sessionId}|${userId}`;
    const attempts = this.wrongCodes.get(key);
    if (attempts && nowMs - attempts.windowStart < WRONG_CODE_WINDOW_MS) return attempts.count < this.maxWrongCodes;
    this.wrongCodes.set(key, { windowStart: nowMs, count: 0 });
    return true;
  }

  async codeAttemptFailed(sessionId: string, userId: number): Promise<void> {
    const attempts = this.wrongCodes.get(`${sessionId}|${userId}`);
    if (attempts) attempts.count += 1;
  }

  async codeAttemptSucceeded(sessionId: string, userId: number): Promise<void> {
    this.wrongCodes.delete(`${sessionId}|${userId}`);
  }
}
