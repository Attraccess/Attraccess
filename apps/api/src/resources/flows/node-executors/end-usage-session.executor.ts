import { ResourceFlowNode, ResourceUsageEndSessionNodeDataSchema } from '@attraccess/database-entities';
import type { SessionEndTarget } from '../../usage/sessions/usage-session-ends';
import { ResourceUsageService } from '../../usage/sessions/resource-usage.service';
import { FlowExecutionError } from '../errors/flow-execution.error';
import { NoUsageSessionError } from '../errors/no-usage-session.error';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';
import { resolveTriggeringUsage } from './triggering-usage';
import { requireRunMachineId } from './flow.utils';
import { SYSTEM_AUDIT_ACTOR } from '../../../audit/recorder/audit-event';

export class EndUsageSessionExecutor implements NodeExecutor {
  constructor(private readonly resourceUsageService: ResourceUsageService) {}

  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    const { notes, target, userId } = ResourceUsageEndSessionNodeDataSchema.parse(node.data ?? {}) ?? {};

    const resourceId = await requireRunMachineId(node, ctx);

    let finalNotes = '';
    if (typeof notes === 'string' && notes.length > 0) {
      const compiled = ctx.compileTemplate(notes, input);
      finalNotes = compiled && compiled.trim().length > 0 ? compiled : notes;
    }

    if (target === 'user' || target === 'all') {
      const sessionTarget = this.resolveTarget(target, userId, input, ctx);
      // Attributed to the user whose action started this run, never to the payload, which nodes can replace.
      // Inside a start or stop, other sessions end once that start or stop has finished, never from within it.
      if (ctx.lifecycleAttemptId) {
        await this.resourceUsageService.deferSessionEnds(
          ctx.lifecycleAttemptId,
          resourceId,
          sessionTarget,
          finalNotes,
          ctx.transactionManager,
          ctx.actorUserId,
        );
      } else {
        await this.resourceUsageService.endSessionsOfTarget(
          resourceId,
          sessionTarget,
          finalNotes,
          ctx.transactionManager,
          ctx.actorUserId,
        );
      }
      return { payload: input };
    }

    if (ctx.lifecycleAttemptId) {
      // The stopped flow may include an end-session node; it has already claimed the candidate.
      if (ctx.lifecycleCandidateCancellation) return { payload: input };
      await this.resourceUsageService.endLifecycleCandidate(
        ctx.lifecycleAttemptId,
        resourceId,
        finalNotes,
        ctx.actorUserId,
      );
      return { payload: input };
    }

    // End the session that triggered this run; never somebody else's when that one is already gone.
    const { session: activeUsage } = await resolveTriggeringUsage(
      this.resourceUsageService,
      resourceId,
      input,
      ctx.transactionManager,
    );

    if (!activeUsage) {
      throw new NoUsageSessionError();
    }

    if (!activeUsage.user) {
      throw new FlowExecutionError('Active session has no owner user; cannot end');
    }

    await this.resourceUsageService.endSession(
      resourceId,
      activeUsage.user,
      { notes: finalNotes, usageId: activeUsage.id },
      {
        skipFormSubmissions: true,
        skipNoteNotification: true,
        auditOrigin: SYSTEM_AUDIT_ACTOR,
        // Its stop flow runs on behalf of the user who caused this run.
        triggeredByUserId: ctx.actorUserId,
      },
    );

    return { payload: input };
  }

  private resolveTarget(
    target: 'user' | 'all',
    userId: string | undefined,
    input: object,
    ctx: NodeExecutionContext,
  ): SessionEndTarget {
    if (target === 'all') return { kind: 'all' };
    const compiled = userId ? ctx.compileTemplate(userId, input).trim() : '';
    if (!/^\d+$/.test(compiled) || !Number.isSafeInteger(Number(compiled))) {
      throw new FlowExecutionError('End session: the user id must be a number');
    }
    return { kind: 'user', userId: Number(compiled) };
  }
}
