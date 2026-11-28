import type { UsageSession, UsageSessionUser } from '@attraccess/application-models';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { AUDIT_RECORDER, AuditActor, AuditRecorder } from '../../../audit/recorder/audit-event';
import { UsageResourceGate } from '../authorization/usage-resource-gate';
import { ExtendUsageSessionDto } from '../dtos/extendUsageSession.dto';
import { ResourceUsageSessionExtendedEvent } from '../events/resource-usage.events';
import { RESOURCE_USAGE_LOG_CONTEXT, UsageLifecycle } from '../lifecycle/usage-lifecycle';
import { acrossProjectSwitches } from '../sessions/across-project-switches';
import { pickSessionToEnd } from '../sessions/active-usage';
import { SESSION_CHANGE_WAIT_MS } from '../sessions/session-change-queue';
import { UsageSessionEnds } from '../sessions/usage-session-ends';
import { SESSION_DEADLINE_STORE, SessionDeadlineStore } from './session-deadline-store.port';
import { SessionExtensionNotPossibleException } from './session-duration.errors';
import { computeExtension, initialWarnedOffset, MINUTE_MS } from './session-duration.rules';

/** Moves the automatic end of a running session later, within its cap. */
@Injectable()
export class UsageSessionExtensions {
  private readonly logger = new Logger(RESOURCE_USAGE_LOG_CONTEXT);

  constructor(
    private readonly lifecycle: UsageLifecycle,
    private readonly gate: UsageResourceGate,
    private readonly ends: UsageSessionEnds,
    private readonly eventEmitter: EventEmitter2,
    @Inject(SESSION_DEADLINE_STORE) private readonly deadlines: SessionDeadlineStore,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  /**
   * Extends the caller's own session, or the one `dto.usageId` names when the caller may end it. Takes the machine's
   * turn like a stop, so it never interleaves with an automatic end: whichever commits second sees the first. A
   * project switch does not refuse it: before the switch commits, the continuation inherits the new deadline; after,
   * the continuation is what gets extended.
   */
  async extendSession(
    resourceId: number,
    user: UsageSessionUser,
    dto: ExtendUsageSessionDto,
    auditOrigin: AuditActor = { id: user.id, authenticationMethod: 'session' },
  ): Promise<UsageSession> {
    const extend = (named: ExtendUsageSessionDto) =>
      this.ends.runSessionChange(resourceId, randomUUID(), () => this.extendNow(resourceId, user, named, auditOrigin));
    // Without a usageId the caller means their running session. Knowing which one that is now lets the extension follow
    // a switch of it, also one that commits while the extension waits. Someone waits for the answer, so a pending switch
    // holds it up no longer than a busy machine would; then it is refused and can be retried.
    const meantId = dto.usageId ?? (await this.findOwnSessionId(resourceId, user));
    const updated =
      meantId === undefined
        ? await extend(dto)
        : await acrossProjectSwitches(
            this.lifecycle.sessions,
            resourceId,
            meantId,
            (usageId) => extend({ ...dto, usageId }),
            { waitMs: SESSION_CHANGE_WAIT_MS },
          );
    this.eventEmitter.emit(
      ResourceUsageSessionExtendedEvent.EVENT_NAME,
      new ResourceUsageSessionExtendedEvent(updated),
    );
    return updated;
  }

  /** The newest of the user's running sessions on the machine: the one `pickSessionToEnd` takes without a usageId. */
  private async findOwnSessionId(resourceId: number, user: UsageSessionUser): Promise<number | undefined> {
    const sessions = await this.lifecycle.sessions.findActiveSessions(resourceId);
    return [...sessions].reverse().find((session) => session.userId === user.id)?.id;
  }

  private extendNow(
    resourceId: number,
    user: UsageSessionUser,
    dto: ExtendUsageSessionDto,
    auditOrigin: AuditActor,
  ): Promise<UsageSession> {
    return this.lifecycle.transaction(async (scope) => {
      const limit = await this.lifecycle.getSessionLimit(scope, resourceId);
      const sessions = await this.lifecycle.sessions.findActiveSessions(resourceId, scope);
      const session = pickSessionToEnd(sessions, user, dto.usageId, limit);
      await this.gate.assertMayEndSession(session, user);
      // Waits for an automatic end of this session running on another instance; what it committed is read after.
      const locked = await this.deadlines.lockDeadline(session.id, scope);
      if (!locked) throw new SessionExtensionNotPossibleException('This session has just ended or changed');
      // A running session has one attempt at most. A pending switch ends nothing: its commit waits for the row locked
      // above before it reads the deadline.
      const { sessions: store } = this.lifecycle;
      if (
        !(await store.isSessionBeingSwitched(session.id, scope)) &&
        (await store.isSessionBeingEnded(session.id, scope))
      ) {
        throw new SessionExtensionNotPossibleException('This session is being ended');
      }

      const now = new Date();
      const current = { ...session, autoEndAt: locked.autoEndAt };
      const next = computeExtension(current, { extendByMinutes: dto.extendByMinutes, toMax: dto.toMax }, now);
      const previous = current.autoEndAt as Date; // computeExtension refuses a session without a deadline
      const extended = await this.deadlines.extend(
        session.id,
        previous,
        { autoEndAt: next, warnedOffsetMinutes: initialWarnedOffset((next.getTime() - now.getTime()) / MINUTE_MS) },
        scope,
      );
      if (!extended) throw new SessionExtensionNotPossibleException('This session has just ended or changed');

      await this.audit.record(
        {
          domain: 'resource',
          action: 'usage_session.extended',
          actor: auditOrigin,
          subject: { type: 'resource', id: resourceId },
          details: {
            usageId: session.id,
            usageUserId: session.userId,
            previousAutoEndAt: previous.toISOString(),
            autoEndAt: next.toISOString(),
            extendedByMinutes: Math.round((next.getTime() - previous.getTime()) / MINUTE_MS),
          },
        },
        scope,
      );
      this.logger.debug(`Extended session ${session.id} of resource ${resourceId} to ${next.toISOString()}`);
      return this.lifecycle.sessions.findSessionWithRelations(session.id, 'started', scope);
    });
  }
}
