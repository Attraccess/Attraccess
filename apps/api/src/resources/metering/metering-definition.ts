import {
  MeteringCollectNodeDataSchema,
  MeteringStartNodeDataSchema,
  ResourceFlowNodeType,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
} from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { In } from 'typeorm';
import { energyCharge, formatKwh } from './energy';
import { MeterProblem } from './resource-metering.service.route-context';
import { ResourceMeteringServiceRouteContext } from './resource-metering.service.route-context';
export abstract class MeteringDefinitionImplementation extends ResourceMeteringServiceRouteContext {
  async onModuleInit(): Promise<void> {
    await this.operations.update({ status: 'pending' }, { status: 'expired', error: 'Interrupted by a restart' });
  }

  // ---- meter definition -------------------------------------------------------------------------

  /** The meter is defined by its flow branches: trigger → acknowledgement, trigger → report. */
  async getDefinition(resourceId: number) {
    const [nodes, edges] = await Promise.all([
      this.nodes.find({ where: { resourceId } }),
      this.edges.find({ where: { resourceId } }),
    ]);
    const reachable = (triggerType: ResourceFlowNodeType, sinkType: ResourceFlowNodeType): boolean => {
      const types = new Map(nodes.map((node) => [node.id, node.type]));
      const queue = nodes.filter((node) => node.type === triggerType).map((node) => node.id);
      const seen = new Set(queue);
      while (queue.length) {
        const id = queue.shift() as string;
        if (types.get(id) === sinkType) return true;
        for (const edge of edges) {
          if (edge.source === id && !seen.has(edge.target)) {
            seen.add(edge.target);
            queue.push(edge.target);
          }
        }
      }
      return false;
    };
    const has = (type: ResourceFlowNodeType) => nodes.some((node) => node.type === type);
    const problems: MeterProblem[] = [];
    if (!has(ResourceFlowNodeType.INPUT_METERING_START)) problems.push('start-trigger-missing');
    else if (!reachable(ResourceFlowNodeType.INPUT_METERING_START, ResourceFlowNodeType.OUTPUT_METERING_READY)) {
      problems.push('ready-unreachable');
    }
    if (!has(ResourceFlowNodeType.INPUT_METERING_COLLECT)) problems.push('collect-trigger-missing');
    else if (!reachable(ResourceFlowNodeType.INPUT_METERING_COLLECT, ResourceFlowNodeType.OUTPUT_METERING_REPORT)) {
      problems.push('report-unreachable');
    }
    const start = MeteringStartNodeDataSchema.parse(
      nodes.find((node) => node.type === ResourceFlowNodeType.INPUT_METERING_START)?.data ?? {},
    );
    const collect = MeteringCollectNodeDataSchema.parse(
      nodes.find((node) => node.type === ResourceFlowNodeType.INPUT_METERING_COLLECT)?.data ?? {},
    );
    return { configured: problems.length === 0, problems, start, collect };
  }

  // ---- lifecycle --------------------------------------------------------------------------------

  /**
   * Establishes the metering session for a (still tentative) usage. Throws when the meter is missing or
   * does not acknowledge, so an unmetered billed session can never start.
   * `supersedes` is the usage of a takeover's outgoing session: its meter is about to be re-initialized.
   */
  async initialize(input: {
    resourceId: number;
    usageId: number;
    creditsPerKwh: number;
    supersedes?: number;
  }): Promise<void> {
    const definition = await this.getDefinition(input.resourceId);
    if (!definition.configured) {
      throw new BadRequestException('METER_NOT_CONFIGURED', { description: definition.problems.join(', ') });
    }
    const session = await this.sessions.save({
      id: randomUUID(),
      resourceId: input.resourceId,
      usageId: input.usageId,
      status: ResourceMeteringSessionStatus.Active,
      creditsPerKwh: input.creditsPerKwh,
    } as ResourceMeteringSession);
    try {
      await this.runOperation(session, 'start', {
        trigger: ResourceFlowNodeType.INPUT_METERING_START,
        timeoutSeconds: definition.start.timeoutSeconds,
      });
    } catch (error) {
      await this.sessions.delete({ id: session.id });
      if (input.supersedes !== undefined) {
        await this.sessions.update(
          { usageId: input.supersedes },
          { compromisedReason: 'The meter was re-initialized by a takeover that did not complete' },
        );
      }
      throw new BadRequestException(`METER_INITIALIZATION_FAILED: ${this.reason(error)}`);
    }
    // The meter now belongs to the new session; earlier unsettled totals can no longer be reconciled.
    await this.sessions.update(
      { resourceId: input.resourceId, status: ResourceMeteringSessionStatus.Pending },
      {
        status: ResourceMeteringSessionStatus.Failed,
        failureReason: 'The meter was re-initialized for a later session',
      },
    );
  }

  /** The running session's latest accepted total and what it costs so far; `session` is null when nothing is metered. */
  async getLive(resourceId: number) {
    const session = await this.findActiveSession(resourceId);
    if (!session) return { session: null };
    const total = session.latestMicroWh === null ? null : BigInt(session.latestMicroWh);
    return {
      session: {
        sessionId: session.id,
        usageId: session.usageId,
        creditsPerKwh: session.creditsPerKwh,
        latestKwh: total === null ? null : formatKwh(total),
        energyCredits: total === null ? null : energyCharge(total, session.creditsPerKwh),
        latestObservedAt: session.latestObservedAt,
        source: session.source,
      },
    };
  }

  protected findActiveSession(resourceId: number) {
    return this.sessions
      .createQueryBuilder('s')
      .innerJoin(ResourceUsage, 'u', 'u.id = s.usageId')
      .where('s.resourceId = :resourceId AND s.status = :status AND u.endTime IS NULL AND u.lifecyclePending = false', {
        resourceId,
        status: ResourceMeteringSessionStatus.Active,
      })
      .getOne();
  }

  async getStatus(resourceId: number) {
    const definition = await this.getDefinition(resourceId);
    const active = await this.findActiveSession(resourceId);
    const unsettled = await this.sessions.find({
      where: { resourceId, status: In([ResourceMeteringSessionStatus.Pending, ResourceMeteringSessionStatus.Failed]) },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    const kwh = (value: string | null) => (value === null ? null : formatKwh(BigInt(value)));
    return {
      configured: definition.configured,
      problems: definition.problems,
      interimIntervalMinutes: definition.collect.interimIntervalMinutes,
      activeSession: active && {
        sessionId: active.id,
        usageId: active.usageId,
        latestKwh: kwh(active.latestMicroWh),
        latestObservedAt: active.latestObservedAt,
        source: active.source,
      },
      unsettled: unsettled.map((session) => ({
        sessionId: session.id,
        usageId: session.usageId,
        status: session.status,
        reason: session.failureReason,
        latestKwh: kwh(session.latestMicroWh),
        retryable: session.status === ResourceMeteringSessionStatus.Pending,
      })),
    };
  }
}
