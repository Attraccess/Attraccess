import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager, In, Not } from 'typeorm';
import {
  ResourceFlowNodeType,
  ResourceMeter,
  ResourceMeteringOperation,
  ResourceMeteringOperationKind,
  ResourceMeteringSegment,
  ResourceMeteringSegmentParticipant,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
} from '@attraccess/database-entities';

import { runSerializedTransaction } from '../../database/run-serialized-transaction';
import { findActiveUsages } from '../usage/sessions/active-usage';
import type { meterDefinitionFromFlow } from './metering-definition';
import type { MeterFinal } from './metering-settlement';

type Definition = ReturnType<typeof meterDefinitionFromFlow>;

export type SessionValues = Pick<ResourceMeteringSession, 'resourceId' | 'usageId' | 'meterId'> &
  Partial<ResourceMeteringSession>;

export interface SegmentHooks {
  runOperation(
    session: { id: string | null; meterId: number; resourceId: number; usageId: number | null },
    kind: ResourceMeteringOperationKind,
    options: { trigger: ResourceFlowNodeType; timeoutSeconds: number; freshAfter?: Date },
  ): Promise<ResourceMeteringOperation>;
  /** Bills what a closed segment now makes known to sessions that already ended. */
  settleClosed(segmentId: string): Promise<void>;
}

const BOUNDARY_ATTEMPT = { attempts: 1, retryDelaySeconds: 0 };

/**
 * Time segments of a meter that several sessions share. A start or stop reads the meter and closes the segment
 * that has been running; the consumption between the two readings is split equally among the sessions in it.
 * Boundaries of one machine are strictly ordered: every reading goes through the machine's operation queue, and
 * the segment bookkeeping that follows a reading is one serialized transaction.
 */
export class MeteringSegments {
  public constructor(
    private readonly manager: EntityManager,
    private readonly hooks: SegmentHooks,
    private readonly logger: Logger,
  ) {}

  private toParticipant(session: ResourceMeteringSession): ResourceMeteringSegmentParticipant {
    return { usageId: session.usageId, creditsPerUnit: session.creditsPerUnit };
  }

  /** Running sessions that use the meter through shared segments (or alone, on their own total), earliest first. */
  async activeParticipants(
    manager: EntityManager,
    resourceId: number,
    meterId: number,
    excludeUsageIds: Array<number | undefined> = [],
  ): Promise<{ usage: ResourceUsage; session: ResourceMeteringSession }[]> {
    const excluded = new Set(excludeUsageIds.filter((id): id is number => id !== undefined));
    const usages = (await findActiveUsages(manager, resourceId)).filter((usage) => !excluded.has(usage.id));
    if (!usages.length) return [];
    const sessions = await manager.find(ResourceMeteringSession, {
      where: {
        resourceId,
        meterId,
        usageId: In(usages.map((usage) => usage.id)),
        status: ResourceMeteringSessionStatus.Active,
        accounting: Not('per-session'),
      },
    });
    return usages.flatMap((usage) => {
      const session = sessions.find((candidate) => candidate.usageId === usage.id);
      return session ? [{ usage, session }] : [];
    });
  }

  /** Whether another published session than the starting one (and the one it takes over) is running. */
  async otherActiveUsages(resourceId: number, usageId: number, supersedes?: number): Promise<boolean> {
    const excluded = new Set<number | undefined>([usageId, supersedes]);
    return (await findActiveUsages(this.manager, resourceId)).some((usage) => !excluded.has(usage.id));
  }

  /** Closes the open segment after a retried boundary reading that the caller already ran. */
  async closeAfter(
    operation: ResourceMeteringOperation,
    actives: { usage: ResourceUsage; session: ResourceMeteringSession }[],
  ): Promise<void> {
    const meter = await this.manager.findOneOrFail(ResourceMeter, { where: { id: operation.meterId } });
    const open = await this.findOpen(this.manager, operation.meterId);
    const stored = new Map((open?.participants ?? []).map((participant) => [participant.usageId, participant]));
    await this.close({
      resourceId: operation.resourceId,
      meterId: operation.meterId,
      reading: this.readingOf(operation, meter),
      next: actives.map(({ session }) => stored.get(session.usageId) ?? this.toParticipant(session)),
    });
  }

  findOpen(manager: EntityManager, meterId: number): Promise<ResourceMeteringSegment | null> {
    return manager.findOne(ResourceMeteringSegment, { where: { meterId, status: 'open' }, order: { startedAt: 'DESC' } });
  }

  /**
   * The segment the running sessions are in. A session that started while the machine allowed one session at a
   * time has no segment: its own total since its start is the segment, so it joins the others from the moment they
   * start. Sessions that are missing from the open segment (an interrupted lifecycle) are added to it.
   */
  async ensureOpen(
    manager: EntityManager,
    meter: ResourceMeter,
    actives: { usage: ResourceUsage; session: ResourceMeteringSession }[],
  ): Promise<ResourceMeteringSegment> {
    let segment = await this.findOpen(manager, meter.id);
    if (!segment) {
      const first = actives[0];
      segment = await manager.save(ResourceMeteringSegment, {
        id: randomUUID(),
        resourceId: meter.resourceId,
        meterId: meter.id,
        status: 'open',
        startedAt: first?.usage.startTime ?? new Date(),
        startValue: first?.session.baselineValue ?? meter.counterValue ?? '0',
        endValue: null,
        endedAt: null,
        participants: [],
      });
    }
    const known = new Set(segment.participants.map((participant) => participant.usageId));
    const missing = actives.filter(({ session }) => !known.has(session.usageId));
    if (missing.length) {
      segment.participants = [...segment.participants, ...missing.map(({ session }) => this.toParticipant(session))];
      await manager.update(ResourceMeteringSegment, segment.id, { participants: segment.participants });
    }
    const ids = actives.map(({ session }) => session.id);
    if (ids.length)
      await manager.update(ResourceMeteringSession, { id: In(ids), accounting: 'own' }, { accounting: 'segmented' });
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
    next: ResourceMeteringSegmentParticipant[];
  }): Promise<ResourceMeteringSegment | null> {
    const closed = await runSerializedTransaction(this.manager, async (manager) => {
      const segment = await this.findOpen(manager, input.meterId);
      if (segment) {
        await manager.update(ResourceMeteringSegment, segment.id, {
          status: 'closed',
          endedAt: input.reading.observedAt,
          endValue: input.reading.value,
        });
      }
      if (input.next.length) {
        await manager.save(ResourceMeteringSegment, {
          id: randomUUID(),
          resourceId: input.resourceId,
          meterId: input.meterId,
          status: 'open',
          startedAt: input.reading.observedAt,
          startValue: input.reading.value,
          endValue: null,
          endedAt: null,
          participants: input.next,
        });
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
  private readingOf(operation: ResourceMeteringOperation, meter: ResourceMeter): { value: string; observedAt: Date } {
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
  ): Promise<{ session: ResourceMeteringSession; initialized: boolean } | null> {
    const meter = await this.manager.findOneOrFail(ResourceMeter, { where: { id: values.meterId } });
    const usage = await this.manager.findOneOrFail(ResourceUsage, { where: { id: values.usageId } });
    const rate = values.creditsPerUnit ?? 0;
    const actives = await this.activeParticipants(this.manager, values.resourceId, values.meterId, [
      values.usageId,
      supersedes,
    ]);
    const session = await this.manager.save(ResourceMeteringSession, { ...values, accounting: 'segmented' });
    const newcomer = this.toParticipant(session);
    if (!actives.length) {
      // Nobody is using the meter: initialize it as a single session does. Segments nobody can claim are stale.
      await this.manager.update(
        ResourceMeteringSegment,
        { meterId: values.meterId, status: 'open' },
        { status: 'abandoned' },
      );
      try {
        await this.hooks.runOperation(session, 'start', {
          trigger: ResourceFlowNodeType.INPUT_METERING_START,
          timeoutSeconds: definition.start.timeoutSeconds,
        });
      } catch (error) {
        if (rate > 0) throw error;
        await this.manager.delete(ResourceMeteringSession, session.id);
        this.logger.warn(`Skipping tracking-only meter ${values.meterId}: ${String(error)}`);
        return null;
      }
      const started = await this.manager.findOneOrFail(ResourceMeteringSession, { where: { id: session.id } });
      await this.manager.save(ResourceMeteringSegment, {
        id: randomUUID(),
        resourceId: values.resourceId,
        meterId: values.meterId,
        status: 'open',
        startedAt: now,
        startValue: started.baselineValue ?? '0',
        endValue: null,
        endedAt: null,
        participants: [newcomer],
      });
      return { session: started, initialized: true };
    }
    // The meter is in use: read it where it stands, without resetting what the others are consuming.
    const open = await this.ensureOpen(this.manager, meter, actives);
    try {
      const operation = await this.hooks.runOperation(session, 'boundary', {
        trigger: ResourceFlowNodeType.INPUT_METERING_COLLECT,
        timeoutSeconds: definition.collect.timeoutSeconds,
        freshAfter: usage.startTime,
      });
      const fresh = await this.manager.findOneOrFail(ResourceMeter, { where: { id: meter.id } });
      await this.close({
        resourceId: values.resourceId,
        meterId: values.meterId,
        reading: this.readingOf(operation, fresh),
        next: [...open.participants, newcomer],
      });
    } catch (error) {
      await this.manager.delete(ResourceMeteringSession, session.id);
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
    session: ResourceMeteringSession,
    definition: Definition,
    freshAfter: Date,
    sleep: (seconds: number) => Promise<void>,
  ): Promise<MeterFinal> {
    const actives = await this.activeParticipants(this.manager, session.resourceId, session.meterId, [session.usageId]);
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
        const meter = await this.manager.findOneOrFail(ResourceMeter, { where: { id: session.meterId } });
        const open = await this.findOpen(this.manager, session.meterId);
        const stored = new Map((open?.participants ?? []).map((participant) => [participant.usageId, participant]));
        await this.close({
          resourceId: session.resourceId,
          meterId: session.meterId,
          reading: this.readingOf(operation, meter),
          next: actives.map(({ session: other }) => stored.get(other.usageId) ?? this.toParticipant(other)),
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
  async restore(manager: EntityManager, usageId: number): Promise<void> {
    const sessions = await manager.find(ResourceMeteringSession, {
      where: { usageId, status: ResourceMeteringSessionStatus.Active, accounting: 'segmented' },
    });
    for (const session of sessions) {
      const meter = await manager.findOneOrFail(ResourceMeter, { where: { id: session.meterId } });
      const open = await this.findOpen(manager, session.meterId);
      if (!open) {
        await manager.save(ResourceMeteringSegment, {
          id: randomUUID(),
          resourceId: session.resourceId,
          meterId: session.meterId,
          status: 'open',
          startedAt: new Date(),
          startValue: meter.counterValue ?? session.baselineValue ?? '0',
          endValue: null,
          endedAt: null,
          participants: [this.toParticipant(session)],
        });
      } else if (!open.participants.some((participant) => participant.usageId === usageId)) {
        await manager.update(ResourceMeteringSegment, open.id, {
          participants: [...open.participants, this.toParticipant(session)],
        });
      }
    }
  }

  /** A tentative start that is rolled back never took part: the segment it was added to simply goes on without it. */
  async withdraw(manager: EntityManager, usageId: number): Promise<void> {
    const meterIds = (await manager.find(ResourceMeteringSession, { where: { usageId }, select: { meterId: true } })).map(
      (session) => session.meterId,
    );
    if (!meterIds.length) return;
    const open = await manager.find(ResourceMeteringSegment, { where: { status: 'open', meterId: In(meterIds) } });
    for (const segment of open) {
      if (segment.participants.some((participant) => participant.usageId === usageId)) {
        await manager.update(ResourceMeteringSegment, segment.id, {
          participants: segment.participants.filter((participant) => participant.usageId !== usageId),
        });
      }
    }
  }
}
