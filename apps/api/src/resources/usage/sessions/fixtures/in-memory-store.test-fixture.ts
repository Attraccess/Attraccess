import { ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import type {
  SupervisionMode,
  UsageBillingItemDraft,
  UsageLifecycleAttempt,
  UsageMeterRate,
  UsageSession,
  UsageSessionResource,
  UsageSessionUser,
} from '@attraccess/application-models';
import type { TransactionContext } from '../../../../database/transaction-context';
import type { TransactionScope, UnitOfWork } from '../../../../database/unit-of-work';
import {
  DoorActionDraft,
  MachineCapacity,
  PendingSessionDraft,
  SessionPage,
  UsageSessionStore,
} from '../../usage-session-store.port';
import { sessionLimitOf } from '../active-usage';

type StoredSession = Omit<UsageSession, 'user' | 'resource' | 'project' | 'supervisorUser'>;

const session = (fields: Partial<StoredSession> & Pick<StoredSession, 'id' | 'resourceId'>): StoredSession => ({
  usageAction: ResourceUsageAction.Usage,
  userId: null,
  startTime: new Date('2026-01-01T10:00:00.000Z'),
  startNotes: null,
  endTime: null,
  endNotes: null,
  usageInMinutes: -1,
  projectId: null,
  isFinalized: true,
  lifecyclePending: false,
  supervisorUserId: null,
  sessionDurationCreditsPerMinute: null,
  operatingDurationCreditsPerMinute: null,
  creditsPerUsage: null,
  billingFactor: null,
  meterRates: null,
  attributedOperatingDurationInMinutes: null,
  formSubmissions: undefined,
  billingTransaction: null,
  ...fields,
});

interface Snapshot {
  sessions: StoredSession[];
  attempts: Map<string, UsageLifecycleAttempt>;
  appliedDrafts: UsageLifecycleAttempt[];
}

/**
 * A stateful usage session store for service specs: it keeps sessions, lifecycle attempts and the resources and
 * users they refer to in memory and obeys the contract documented on the port (what is visible, what blocks a
 * machine, a session ends once, only tentative sessions are deleted). Specs arrange the state a business case
 * needs and assert what the store holds afterwards; nothing here knows about SQL.
 *
 * `unitOfWork()` gives the matching unit of work: it restores the state when the work fails, so a spec can prove a
 * failed change left nothing behind, and it runs post-commit effects after the work succeeded.
 */
export class InMemoryUsageSessionStore implements UsageSessionStore {
  readonly resources = new Map<number, UsageSessionResource>();
  readonly users = new Map<number, UsageSessionUser>();
  readonly groups = new Map<number, number[]>();
  readonly meterRates = new Map<number, UsageMeterRate[]>();
  /** Sessions and door actions as stored, in creation order. */
  sessions: StoredSession[] = [];
  attempts = new Map<string, UsageLifecycleAttempt>();
  /** The attempts whose forms and billing items were stored on the session's bill, in the order they were applied. */
  appliedDrafts: UsageLifecycleAttempt[] = [];
  private nextId = 1000;
  private transactionDepth = 0;

  // ---- arranging state -------------------------------------------------------------------------------------

  addResource(resource: UsageSessionResource): UsageSessionResource {
    this.resources.set(resource.id, resource);
    return resource;
  }

  addUser(user: UsageSessionUser): UsageSessionUser {
    this.users.set(user.id, user);
    return user;
  }

  /** A stored session. Without fields it is a published, running usage session. */
  addSession(fields: Partial<StoredSession> & Pick<StoredSession, 'id' | 'resourceId'>): UsageSession {
    const stored = session(fields);
    this.sessions.push(stored);
    return this.withRelations(stored);
  }

  /** The session as the store would read it now, or undefined. */
  sessionById(id: number): UsageSession | undefined {
    const stored = this.sessions.find((candidate) => candidate.id === id);
    return stored && this.withRelations(stored);
  }

  get inTransaction(): boolean {
    return this.transactionDepth > 0;
  }

  /** The unit of work whose commit and rollback match this store. */
  unitOfWork(): UnitOfWork {
    return {
      run: async (work) => {
        const callbacks: Array<() => void | Promise<void>> = [];
        const scope: TransactionScope = { isOpen: true, afterCommit: (callback) => void callbacks.push(callback) };
        const before = this.snapshot();
        this.transactionDepth++;
        let result: Awaited<ReturnType<typeof work>>;
        try {
          result = await work(scope);
        } catch (error) {
          this.restore(before);
          throw error;
        } finally {
          this.transactionDepth--;
        }
        for (const callback of callbacks) await callback();
        return result;
      },
      current: () => undefined,
    };
  }

  private snapshot(): Snapshot {
    return {
      sessions: this.sessions.map((stored) => ({ ...stored })),
      attempts: new Map([...this.attempts].map(([id, attempt]) => [id, { ...attempt }])),
      appliedDrafts: [...this.appliedDrafts],
    };
  }

  private restore(snapshot: Snapshot): void {
    this.sessions = snapshot.sessions;
    this.attempts = snapshot.attempts;
    this.appliedDrafts = snapshot.appliedDrafts;
  }

  private withRelations(stored: StoredSession): UsageSession {
    return {
      ...stored,
      user: stored.userId === null ? null : (this.users.get(stored.userId) ?? null),
      resource: this.resources.get(stored.resourceId) ?? null,
      project: stored.projectId === null ? null : { id: stored.projectId },
      supervisorUser: stored.supervisorUserId === null ? null : (this.users.get(stored.supervisorUserId) ?? null),
    };
  }

  private published(resourceId: number): StoredSession[] {
    return this.sessions
      .filter(
        (stored) =>
          stored.resourceId === resourceId &&
          stored.usageAction === ResourceUsageAction.Usage &&
          stored.isFinalized &&
          !stored.lifecyclePending &&
          stored.endTime === null,
      )
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime() || a.id - b.id);
  }

  private occupying(resourceId: number): StoredSession[] {
    return this.sessions.filter(
      (stored) =>
        stored.resourceId === resourceId &&
        stored.usageAction === ResourceUsageAction.Usage &&
        stored.endTime === null &&
        (stored.isFinalized || stored.lifecyclePending),
    );
  }

  private required(usageId: number): StoredSession {
    const stored = this.sessions.find((candidate) => candidate.id === usageId);
    if (!stored) throw new Error(`Usage session ${usageId} does not exist`);
    return stored;
  }

  // ---- the port --------------------------------------------------------------------------------------------

  async findSessionLimit(resourceId: number, _context?: TransactionContext): Promise<number> {
    return sessionLimitOf(this.resources.get(resourceId));
  }

  async findMachineCapacity(resourceId: number): Promise<MachineCapacity | null> {
    const resource = this.resources.get(resourceId);
    return resource ? { type: resource.type, maxParallelSessions: resource.maxParallelSessions ?? 1 } : null;
  }

  async findActiveSessions(resourceId: number, _context?: TransactionContext): Promise<UsageSession[]> {
    return this.published(resourceId).map((stored) => this.withRelations(stored));
  }

  async findActiveSessionsByResource(resourceIds: number[]): Promise<Map<number, UsageSession[]>> {
    return new Map(
      resourceIds.map((id) => [id, this.published(id).map((stored) => this.withRelations(stored))] as const),
    );
  }

  async countActiveSessions(resourceId: number, _context?: TransactionContext): Promise<number> {
    return this.published(resourceId).length;
  }

  async findOwnOpenSession(
    resourceId: number,
    userId: number,
    _context?: TransactionContext,
  ): Promise<UsageSession | null> {
    const own = this.sessions.find(
      (stored) =>
        stored.resourceId === resourceId &&
        stored.userId === userId &&
        stored.usageAction === ResourceUsageAction.Usage &&
        stored.endTime === null,
    );
    return own ? this.withRelations(own) : null;
  }

  async findOccupyingUserIds(resourceId: number, _context?: TransactionContext): Promise<number[]> {
    return this.occupying(resourceId).flatMap((stored) => (stored.userId === null ? [] : [stored.userId]));
  }

  async countOccupiedSlots(resourceId: number, _context?: TransactionContext): Promise<number> {
    return this.occupying(resourceId).length;
  }

  async findPublishedSession(resourceId: number, usageId: number): Promise<UsageSession | null> {
    const found = this.sessions.find(
      (stored) => stored.id === usageId && stored.resourceId === resourceId && !stored.lifecyclePending,
    );
    return found ? this.withRelations(found) : null;
  }

  async findHistory(resourceId: number, page: number, limit: number, userId?: number): Promise<SessionPage> {
    const matching = this.sessions
      .filter(
        (stored) =>
          stored.resourceId === resourceId && !stored.lifecyclePending && (!userId || stored.userId === userId),
      )
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    return {
      data: matching.slice((page - 1) * limit, page * limit).map((stored) => this.withRelations(stored)),
      total: matching.length,
    };
  }

  async findSessionForProjectChange(resourceId: number, usageId: number): Promise<UsageSession | null> {
    const found = this.sessions.find((stored) => stored.id === usageId && stored.resourceId === resourceId);
    return found ? this.withRelations(found) : null;
  }

  async assignProject(usage: UsageSession, project: { id: number } | null): Promise<UsageSession> {
    const stored = this.required(usage.id);
    stored.projectId = project?.id ?? null;
    return this.withRelations(stored);
  }

  async findSessionForEvent(usageId: number, _context?: TransactionContext): Promise<UsageSession | null> {
    const found = this.sessions.find((stored) => stored.id === usageId);
    return found ? this.withRelations(found) : null;
  }

  async findEndableSession(
    resourceId: number,
    usageId: number,
    _context?: TransactionContext,
  ): Promise<UsageSession | null> {
    const found = this.published(resourceId).find((stored) => stored.id === usageId);
    if (!found) return null;
    const beingEnded = [...this.attempts.values()].some(
      (attempt) => attempt.resourceId === resourceId && attempt.kind === 'end' && attempt.previousUsageId === usageId,
    );
    return beingEnded ? null : this.withRelations(found);
  }

  async findSessionIdsBeingEnded(resourceId: number, _context?: TransactionContext): Promise<Set<number>> {
    return new Set(
      [...this.attempts.values()].flatMap((attempt) =>
        attempt.resourceId === resourceId && attempt.kind === 'end' && attempt.previousUsageId !== null
          ? [attempt.previousUsageId]
          : [],
      ),
    );
  }

  async findMeterRates(resourceId: number, _context?: TransactionContext): Promise<UsageMeterRate[]> {
    return this.meterRates.get(resourceId) ?? [];
  }

  async findResource(resourceId: number, _context?: TransactionContext): Promise<UsageSessionResource | null> {
    return this.resources.get(resourceId) ?? null;
  }

  async findSupervisionModes(resourceIds: number[]): Promise<Map<number, SupervisionMode | undefined>> {
    return new Map(
      resourceIds.flatMap((id) => {
        const resource = this.resources.get(id);
        return resource ? [[id, resource.supervisionMode] as const] : [];
      }),
    );
  }

  async userExists(userId: number, _context?: TransactionContext): Promise<boolean> {
    return this.users.has(userId);
  }

  async findGroupResourceIds(groupId: number): Promise<number[]> {
    return this.groups.get(groupId) ?? [];
  }

  async countCompletedSupervisedSessions(resourceIds: number[], userId: number): Promise<number> {
    return this.sessions.filter(
      (stored) =>
        resourceIds.includes(stored.resourceId) &&
        stored.userId === userId &&
        stored.supervisorUserId !== null &&
        stored.endTime !== null,
    ).length;
  }

  async isLifecycleBlocked(
    resourceId: number,
    sharedMachine: boolean,
    _context?: TransactionContext,
  ): Promise<boolean> {
    const attempts = [...this.attempts.values()].filter((attempt) => attempt.resourceId === resourceId);
    if (sharedMachine) return attempts.some((attempt) => attempt.kind === 'takeover');
    return (
      attempts.length > 0 ||
      this.sessions.some(
        (stored) => stored.resourceId === resourceId && stored.endTime === null && stored.lifecyclePending,
      )
    );
  }

  async findAttempt(
    attemptId: string,
    resourceId: number,
    _context?: TransactionContext,
  ): Promise<UsageLifecycleAttempt | null> {
    const attempt = this.attempts.get(attemptId);
    return attempt && attempt.resourceId === resourceId ? { ...attempt } : null;
  }

  async isSessionBeingEnded(usageId: number, _context?: TransactionContext): Promise<boolean> {
    return [...this.attempts.values()].some((attempt) => attempt.previousUsageId === usageId);
  }

  async saveAttempt(attempt: UsageLifecycleAttempt, _context?: TransactionContext): Promise<UsageLifecycleAttempt> {
    const saved = { createdAt: new Date(), ...attempt };
    this.attempts.set(attempt.id, saved);
    return { ...saved };
  }

  async deleteAttempt(attemptId: string, resourceId: number, _context?: TransactionContext): Promise<void> {
    if (this.attempts.get(attemptId)?.resourceId === resourceId) this.attempts.delete(attemptId);
  }

  async clearAttemptCandidate(attemptId: string, resourceId: number, _context?: TransactionContext): Promise<void> {
    const attempt = this.attempts.get(attemptId);
    if (attempt?.resourceId === resourceId) attempt.candidateUsageId = null;
  }

  async setBillingItems(
    attemptId: string,
    items: UsageBillingItemDraft[],
    _context?: TransactionContext,
  ): Promise<void> {
    const attempt = this.attempts.get(attemptId);
    if (attempt) attempt.billingItems = items;
  }

  async listAttemptIds(): Promise<{ id: string; createdAt: Date }[]> {
    return [...this.attempts.values()].map(({ id, createdAt }) => ({ id, createdAt: createdAt ?? new Date() }));
  }

  async findAttemptsByIds(ids: string[], _context?: TransactionContext): Promise<UsageLifecycleAttempt[]> {
    return ids.flatMap((id) =>
      this.attempts.has(id) ? [{ ...(this.attempts.get(id) as UsageLifecycleAttempt) }] : [],
    );
  }

  async createPendingSession(draft: PendingSessionDraft, _context?: TransactionContext): Promise<UsageSession> {
    const owner = this.users.get(draft.userId);
    const stored = session({
      id: this.nextId++,
      resourceId: draft.resourceId,
      userId: draft.userId,
      startTime: draft.startTime,
      startNotes: draft.startNotes ?? null,
      isFinalized: false,
      lifecyclePending: true,
      sessionDurationCreditsPerMinute: draft.sessionDurationCreditsPerMinute,
      operatingDurationCreditsPerMinute: draft.operatingDurationCreditsPerMinute,
      creditsPerUsage: draft.creditsPerUsage,
      meterRates: draft.meterRates,
      supervisorUserId: draft.supervisorUserId ?? null,
      projectId: draft.projectId ?? null,
      billingFactor: owner?.billingFactor ?? null,
    });
    this.sessions.push(stored);
    return this.withRelations(stored);
  }

  async findPendingSession(usageId: number, _context?: TransactionContext): Promise<UsageSession | null> {
    const found = this.sessions.find((stored) => stored.id === usageId && stored.lifecyclePending);
    return found ? this.withRelations(found) : null;
  }

  async deletePendingSession(usageId: number, _context?: TransactionContext): Promise<boolean> {
    const before = this.sessions.length;
    this.sessions = this.sessions.filter((stored) => !(stored.id === usageId && stored.lifecyclePending));
    return this.sessions.length !== before;
  }

  async publishSession(usageId: number, _context?: TransactionContext): Promise<void> {
    Object.assign(this.required(usageId), { isFinalized: true, lifecyclePending: false });
  }

  async endSessionIfOpen(
    usageId: number,
    end: { endTime: Date; endNotes: string | null | undefined },
    _context?: TransactionContext,
  ): Promise<boolean> {
    const stored = this.required(usageId);
    if (stored.endTime !== null) return false;
    stored.endTime = end.endTime;
    stored.endNotes = end.endNotes ?? null;
    stored.usageInMinutes = Math.max(0, (end.endTime.getTime() - stored.startTime.getTime()) / 60_000);
    return true;
  }

  async setAttributedOperatingDuration(usageId: number, minutes: number, _context?: TransactionContext): Promise<void> {
    this.required(usageId).attributedOperatingDurationInMinutes = minutes;
  }

  async findSessionWithRelations(
    usageId: number,
    _shape?: 'ended' | 'started',
    _context?: TransactionContext,
  ): Promise<UsageSession> {
    return this.withRelations(this.required(usageId));
  }

  async applyAttemptDrafts(attempt: UsageLifecycleAttempt, _context?: TransactionContext): Promise<void> {
    this.appliedDrafts.push(attempt);
  }

  async recordDoorAction(draft: DoorActionDraft): Promise<UsageSession> {
    const now = new Date();
    const stored = session({
      id: this.nextId++,
      resourceId: draft.resourceId,
      userId: draft.userId,
      usageAction: draft.action,
      startTime: now,
      endTime: now,
      usageInMinutes: 0,
    });
    this.sessions.push(stored);
    return this.withRelations(stored);
  }

  async recoverOrphanedSessions(_context?: TransactionContext): Promise<number> {
    return 0;
  }
}

/** A machine the way specs usually need it: exclusive, introduction required unless told otherwise. */
export const machineResource = (fields: Partial<UsageSessionResource> = {}): UsageSessionResource => ({
  id: 1,
  name: 'Test Resource',
  type: ResourceType.Machine,
  allowTakeOver: false,
  ...fields,
});
