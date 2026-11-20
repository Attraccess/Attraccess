import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  MeteringUsageRecord,
  NewResourceMeteringSession,
  ResourceFlowNodeType,
  ResourceMeterRecord,
  MeteringOperationKind,
  ResourceMeteringOperationRecord,
  MeteringSegmentParticipant,
  ResourceMeteringSegmentRecord,
  ResourceMeteringSessionRecord,
} from '@attraccess/application-models';

import type { TransactionContext } from '../../database/transaction-context';
import type { UnitOfWork } from '../../database/unit-of-work';
import { MeteringOperationError } from './metering-readings';
import type { meterDefinitionFromFlow } from './metering-definition';
import type { MeteringStore } from './metering-store.port';
import type { MeterFinal } from './metering-settlement';

type Definition = ReturnType<typeof meterDefinitionFromFlow>;

export type SessionValues = NewResourceMeteringSession;

export interface SegmentHooks {
  runOperation(
    session: { id: string | null; meterId: number; resourceId: number; usageId: number | null },
    kind: MeteringOperationKind,
    options: { trigger: ResourceFlowNodeType; timeoutSeconds: number; freshAfter?: Date },
  ): Promise<ResourceMeteringOperationRecord>;
  /** Bills what a closed segment now makes known to sessions that already ended. */
  settleClosed(segmentId: string): Promise<void>;
}

const BOUNDARY_ATTEMPT = { attempts: 1, retryDelaySeconds: 0 };

interface ActiveParticipant {
  usage: MeteringUsageRecord;
  session: ResourceMeteringSessionRecord;
}

/**
 * Time segments of a meter that several sessions share. A start or stop reads the meter and closes the segment
 * that has been running; the consumption between the two readings is split equally among the sessions in it.
 * Boundaries of one machine are strictly ordered: every reading goes through the machine's operation queue, and
 * the segment bookkeeping that follows a reading is one atomic unit of work.
 */
export class MeteringSegments {
  public constructor(
    private readonly store: MeteringStore,
    private readonly unitOfWork: UnitOfWork,
    private readonly hooks: SegmentHooks,
    private readonly logger: Logger,
  ) {}

  private toParticipant(session: ResourceMeteringSessionRecord): MeteringSegmentParticipant {
    return { usageId: session.usageId, creditsPerUnit: session.creditsPerUnit };
  }

  /**
   * The participants of the segment that follows a boundary: the sessions still running, earliest first, keeping
   * what the open segment stored for them. A session that stopped (even one whose own stop reading failed) is never
   * carried into it.
   */
  private nextParticipants(
    open: ResourceMeteringSegmentRecord | null,
    actives: { session: ResourceMeteringSessionRecord }[],
  ): MeteringSegmentParticipant[] {
    const stored = new Map((open?.participants ?? []).map((participant) => [participant.usageId, participant]));
    return actives.map(({ session }) => stored.get(session.usageId) ?? this.toParticipant(session));
  }

  /** Participants stay ordered by usage, which is their start order: the position decides a rounding tie. */
  private inStartOrder(participants: MeteringSegmentParticipant[]): MeteringSegmentParticipant[] {
    return [...participants].sort((left, right) => left.usageId - right.usageId);
  }

  private openSegment(
    values: Pick<ResourceMeteringSegmentRecord, 'resourceId' | 'meterId' | 'startedAt' | 'startValue' | 'participants'>,
  ): ResourceMeteringSegmentRecord {
    return { id: randomUUID(), status: 'open', endValue: null, endedAt: null, ...values };
  }

  /** Running sessions that use the meter through shared segments (or alone, on their own total), earliest first. */
  async activeParticipants(
    context: TransactionContext | undefined,
    resourceId: number,
    meterId: number,
    excludeUsageIds: Array<number | undefined> = [],
  ): Promise<ActiveParticipant[]> {
    const excluded = new Set(excludeUsageIds.filter((id): id is number => id !== undefined));
    const usages = (await this.store.findRunningUsages(resourceId, context)).filter((usage) => !excluded.has(usage.id));
    if (!usages.length) return [];
    const sessions = await this.store.findSharingSessions(
      resourceId,
      meterId,
      usages.map((usage) => usage.id),
      context,
    );
    return usages.flatMap((usage) => {
      const session = sessions.find((candidate) => candidate.usageId === usage.id);
      return session ? [{ usage, session }] : [];
    });
  }

  /** Whether another published session than the starting one (and the one it takes over) is running. */
  async otherActiveUsages(resourceId: number, usageId: number, supersedes?: number): Promise<boolean> {
    const excluded = new Set<number | undefined>([usageId, supersedes]);
    return (await this.store.findRunningUsages(resourceId)).some((usage) => !excluded.has(usage.id));
  }

  /**
   * A retry of a share whose segment never got its closing reading. While sessions run, their next start or stop
   * reads the meter and bills it; a retry does not take a session-change turn, so it never reads the meter under them.
   */
  async retryClosing(
    session: ResourceMeteringSessionRecord,
    usage: MeteringUsageRecord,
    timeoutSeconds: number,
  ): Promise<void> {
    const open = await this.store.findOpenSegment(session.meterId);
    if (!open?.participants.some((participant) => participant.usageId === session.usageId)) return;
    if ((await this.activeParticipants(undefined, session.resourceId, session.meterId)).length)
      throw new MeteringOperationError(
        'Sessions are still running on this machine; the share is billed when one of them starts or stops',
      );
    const operation = await this.hooks.runOperation(session, 'final', {
      trigger: ResourceFlowNodeType.INPUT_METERING_COLLECT,
      timeoutSeconds,
      freshAfter: usage.endTime ?? undefined,
    });
    await this.closeAfter(operation, open, []);
  }

  /** Whether running sessions other than the starting one (and the one it takes over) share the meter's segments. */
  async inUseBySegments(
    resourceId: number,
    meterId: number,
    starting: { usageId: number; supersedes?: number },
  ): Promise<boolean> {
    const others = await this.activeParticipants(undefined, resourceId, meterId, [
      starting.usageId,
      starting.supersedes,
    ]);
    return others.some(({ session }) => session.accounting === 'segmented');
  }

  /** The meter starts over: open segments can no longer get their closing reading. */
  async abandonOpen(context: TransactionContext | undefined, meterId: number, at = new Date()): Promise<void> {
    await this.store.abandonOpenSegments(meterId, at, context);
  }

  /**
   * Closes the segment a retry read the meter for. A retry does not take a session-change turn, so a start or
   * stop may have closed that segment meanwhile; then nothing is closed and the retry is refused, since its
   * snapshot of the running sessions is out of date.
   */
  async closeAfter(
    operation: ResourceMeteringOperationRecord,
    segment: ResourceMeteringSegmentRecord,
    actives: ActiveParticipant[],
  ): Promise<void> {
    const meter = await this.requireMeter(operation.meterId);
    await this.close({
      resourceId: operation.resourceId,
      meterId: operation.meterId,
      reading: this.readingOf(operation, meter),
      next: this.nextParticipants(segment, actives),
      expectedOpenId: segment.id,
    });
  }

  private async requireMeter(meterId: number): Promise<ResourceMeterRecord> {
    const meter = await this.store.findMeterById(meterId);
    if (!meter) throw new Error(`The meter ${meterId} does not exist`);
    return meter;
  }

  /**
   * The segment the running sessions are in. A session that started while the machine allowed one session at a
   * time has no segment: its own total since its start is the segment, so it joins the others from the moment they
   * start. Sessions that are missing from the open segment (an interrupted lifecycle) are added to it.
   */
  async ensureOpen(
    context: TransactionContext | undefined,
    meter: ResourceMeterRecord,
    actives: ActiveParticipant[],
  ): Promise<ResourceMeteringSegmentRecord> {
    let segment = await this.store.findOpenSegment(meter.id, context);
    if (!segment) {
      const first = actives[0];
      segment = this.openSegment({
        resourceId: meter.resourceId,
        meterId: meter.id,
        startedAt: first?.usage.startTime ?? new Date(),
        startValue: first?.session.baselineValue ?? meter.counterValue ?? '0',
        participants: [],
      });
      await this.store.createSegment(segment, context);
    }
    const known = new Set(segment.participants.map((participant) => participant.usageId));
    const missing = actives.filter(({ session }) => !known.has(session.usageId));
    if (missing.length) {
      segment.participants = this.inStartOrder([
        ...segment.participants,
        ...missing.map(({ session }) => this.toParticipant(session)),
      ]);
      await this.store.updateSegment(segment.id, { participants: segment.participants }, context);
    }
    const ids = actives.map(({ session }) => session.id);
    if (ids.length) await this.store.markSessionsSegmented(ids, context);
    return segment;
  }

  /**
   * Closes the open segment at a boundary reading and opens the next one with `next`, unless nobody is left.
   * The segment's participants are everyone who was in it at any point. Returns the closed segment.
   */
  async close(input: {
    resourceId: number;
    meterId: number;
    reading: { value: string; observedAt: Date };
    next: MeteringSegmentParticipant[];
    /** Only close this segment: refuse when another boundary closed it first. */
    expectedOpenId?: string;
  }): Promise<ResourceMeteringSegmentRecord | null> {
    const closed = await this.unitOfWork.run(async (scope) => {
      const segment = await this.store.findOpenSegment(input.meterId, scope);
      if (input.expectedOpenId !== undefined && segment?.id !== input.expectedOpenId)
        throw new MeteringOperationError(
          'Sessions on the machine changed during the retry; their next start or stop bills it',
        );
      if (segment) {
        await this.store.updateSegment(
          segment.id,
          { status: 'closed', endedAt: input.reading.observedAt, endValue: input.reading.value },
          scope,
        );
      }
      if (input.next.length) {
        await this.store.createSegment(
          this.openSegment({
            resourceId: input.resourceId,
            meterId: input.meterId,
            startedAt: input.reading.observedAt,
            startValue: input.reading.value,
            participants: input.next,
          }),
          scope,
        );
      }
      return segment
        ? { ...segment, status: 'closed' as const, endedAt: input.reading.observedAt, endValue: input.reading.value }
        : null;
    });
    if (closed) {
      await this.hooks
        .settleClosed(closed.id)
        .catch((error) => this.logger.warn(`Billing the closed segment ${closed.id} failed: ${String(error)}`));
    }
    return closed;
  }

  /** The cumulative counter a completed boundary operation reported. */
  private readingOf(
    operation: ResourceMeteringOperationRecord,
    meter: ResourceMeterRecord,
  ): { value: string; observedAt: Date } {
    const value = operation.readingMode === 'increment' ? meter.counterValue : operation.reportedValue;
    if (value == null) throw new Error('The boundary reading is not a cumulative counter');
    return { value, observedAt: operation.observedAt ?? operation.completedAt ?? new Date() };
  }

  /**
   * A session starts on a machine with parallel sessions. The first one on an idle machine initializes the meter;
   * every later one reads it, which closes the segment the others have been sharing. A reading that fails refuses
   * the start of a billed meter and leaves the running sessions untouched. Returns `null` for a tracking-only
   * meter that was skipped.
   */
  async start(
    values: SessionValues,
    definition: Definition,
    /** The outgoing session of a takeover: its stop already took its boundary, it no longer shares anything. */
    supersedes?: number,
    now = new Date(),
  ): Promise<{ session: ResourceMeteringSessionRecord; initialized: boolean } | null> {
    const meter = await this.requireMeter(values.meterId);
    const usage = await this.store.findUsage(values.usageId);
    if (!usage) throw new Error(`The usage ${values.usageId} does not exist`);
    const rate = values.creditsPerUnit ?? 0;
    const actives = await this.activeParticipants(undefined, values.resourceId, values.meterId, [
      values.usageId,
      supersedes,
    ]);
    const session = await this.store.createSession({ ...values, accounting: 'segmented' });
    const newcomer = this.toParticipant(session);
    if (!actives.length) {
      // Nobody is using the meter: initialize it as a single session does.
      try {
        await this.hooks.runOperation(session, 'start', {
          trigger: ResourceFlowNodeType.INPUT_METERING_START,
          timeoutSeconds: definition.start.timeoutSeconds,
        });
      } catch (error) {
        if (rate > 0) throw error;
        await this.store.deleteSession(session.id);
        this.logger.warn(`Skipping tracking-only meter ${values.meterId}: ${String(error)}`);
        return null;
      }
      // The meter starts over, so a segment still waiting for its closing reading can no longer get one. Only now:
      // a start that fails leaves it open for a retry. The caller fails the sessions that were waiting for it.
      await this.abandonOpen(undefined, values.meterId, now);
      const started = await this.store.findSession(session.id);
      if (!started) throw new Error(`The metering session ${session.id} is gone`);
      await this.store.createSegment(
        this.openSegment({
          resourceId: values.resourceId,
          meterId: values.meterId,
          startedAt: now,
          startValue: started.baselineValue ?? '0',
          participants: [newcomer],
        }),
      );
      return { session: started, initialized: true };
    }
    // The meter is in use: read it where it stands, without resetting what the others are consuming.
    const open = await this.ensureOpen(undefined, meter, actives);
    try {
      const operation = await this.hooks.runOperation(session, 'boundary', {
        trigger: ResourceFlowNodeType.INPUT_METERING_COLLECT,
        timeoutSeconds: definition.collect.timeoutSeconds,
        freshAfter: usage.startTime,
      });
      const fresh = await this.requireMeter(meter.id);
      await this.close({
        resourceId: values.resourceId,
        meterId: values.meterId,
        reading: this.readingOf(operation, fresh),
        next: [...this.nextParticipants(open, actives), newcomer],
      });
    } catch (error) {
      await this.store.deleteSession(session.id);
      if (rate > 0) throw error;
      this.logger.warn(`Skipping tracking-only meter ${values.meterId}: ${String(error)}`);
      return null;
    }
    return { session, initialized: false };
  }

  /**
   * A session stops. The meter is read to close the segment it was in. The stop never waits on a meter that does
   * not answer: the segment then stays open and runs until the next successful reading, and everyone active at any
   * point in it shares it. The last session to stop makes the final collection, with its retries.
   */
  async stop(
    session: ResourceMeteringSessionRecord,
    definition: Definition,
    freshAfter: Date,
    sleep: (seconds: number) => Promise<void>,
  ): Promise<MeterFinal> {
    const actives = await this.activeParticipants(undefined, session.resourceId, session.meterId, [session.usageId]);
    const last = actives.length === 0;
    const { attempts, retryDelaySeconds } = last
      ? { attempts: definition.collect.finalAttempts, retryDelaySeconds: definition.collect.finalRetryDelaySeconds }
      : BOUNDARY_ATTEMPT;
    let reason = 'No attempt was made';
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const operation = await this.hooks.runOperation(session, last ? 'final' : 'boundary', {
          trigger: ResourceFlowNodeType.INPUT_METERING_COLLECT,
          timeoutSeconds: definition.collect.timeoutSeconds,
          freshAfter,
        });
        const meter = await this.requireMeter(session.meterId);
        const open = await this.store.findOpenSegment(session.meterId);
        await this.close({
          resourceId: session.resourceId,
          meterId: session.meterId,
          reading: this.readingOf(operation, meter),
          next: this.nextParticipants(open, actives),
        });
        return { status: 'ready', operationId: operation.id };
      } catch (error) {
        reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Boundary reading ${attempt}/${attempts} of meter ${session.meterId} for usage ${session.usageId} failed: ${reason}`,
        );
        if (attempt < attempts && retryDelaySeconds > 0) await sleep(retryDelaySeconds);
      }
    }
    return { status: 'unavailable', reason };
  }

  /**
   * A stop that was cut off or taken back leaves its session running: it takes part in the open segment again.
   * Without any open segment, a new one starts at the meter's current counter.
   */
  async restore(context: TransactionContext | undefined, usageId: number): Promise<void> {
    const sessions = await this.store.findSegmentedRunningSessionsOfUsage(usageId, context);
    for (const session of sessions) {
      const meter = await this.store.findMeterById(session.meterId, context);
      if (!meter) throw new Error(`The meter ${session.meterId} does not exist`);
      const open = await this.store.findOpenSegment(session.meterId, context);
      if (!open) {
        await this.store.createSegment(
          this.openSegment({
            resourceId: session.resourceId,
            meterId: session.meterId,
            startedAt: new Date(),
            startValue: meter.counterValue ?? session.baselineValue ?? '0',
            participants: [this.toParticipant(session)],
          }),
          context,
        );
      } else if (!open.participants.some((participant) => participant.usageId === usageId)) {
        await this.store.updateSegment(
          open.id,
          { participants: this.inStartOrder([...open.participants, this.toParticipant(session)]) },
          context,
        );
      }
    }
  }

  /**
   * A tentative start that is rolled back never took part: the segments it was added to simply go on without it.
   * Found through the open segments themselves, so it also works after its metering sessions were deleted.
   */
  async withdraw(context: TransactionContext | undefined, usageId: number, resourceId?: number): Promise<void> {
    // Few segments are open at any time: one per meter in use.
    const open = await this.store.findOpenSegments(resourceId, context);
    for (const segment of open) {
      if (segment.participants.some((participant) => participant.usageId === usageId)) {
        await this.store.updateSegment(
          segment.id,
          { participants: segment.participants.filter((participant) => participant.usageId !== usageId) },
          context,
        );
      }
    }
  }
}
