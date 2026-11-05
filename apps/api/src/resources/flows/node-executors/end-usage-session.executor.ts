import { ResourceFlowNode, ResourceUsageEndSessionNodeDataSchema } from '@attraccess/database-entities';
import { SessionEndTarget } from '../../usage/sessions/usage-session-changes';
import { ResourceUsageService } from '../../usage/sessions/resource-usage.service';
import { FlowExecutionError } from '../errors/flow-execution.error';
import { NoUsageSessionError } from '../errors/no-usage-session.error';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';
import { resolveTriggeringUsage, triggeringUsageId, triggeringUserIdFromPayload } from './triggering-usage';

export class EndUsageSessionExecutor implements NodeExecutor {
  constructor(private readonly resourceUsageService: ResourceUsageService) {}

  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    const { notes, target, userId } = ResourceUsageEndSessionNodeDataSchema.parse(node.data ?? {}) ?? {};

    let finalNotes = '';
    if (typeof notes === 'string' && notes.length > 0) {
      const compiled = ctx.compileTemplate(notes, input);
      finalNotes = compiled && compiled.trim().length > 0 ? compiled : notes;
    }

    if (target === 'user' || target === 'all') {
      const sessionTarget = this.resolveTarget(target, userId, input, ctx);
      const triggeredByUserId = await this.triggeringUserId(node.resourceId, input, ctx);
      // Inside a start or stop, other sessions end once that start or stop has finished, never from within it.
      if (ctx.lifecycleAttemptId) {
        await this.resourceUsageService.deferSessionEnds(
          ctx.lifecycleAttemptId,
          node.resourceId,
          sessionTarget,
          finalNotes,
          ctx.transactionManager,
          triggeredByUserId,
        );
      } else {
        await this.resourceUsageService.endSessionsOfTarget(
          node.resourceId,
          sessionTarget,
          finalNotes,
          ctx.transactionManager,
          triggeredByUserId,
        );
      }
      return { payload: input };
    }

    if (ctx.lifecycleAttemptId) {
      // The stopped flow may include an end-session node; it has already claimed the candidate.
      if (ctx.lifecycleCandidateCancellation) return { payload: input };
      await this.resourceUsageService.endLifecycleCandidate(ctx.lifecycleAttemptId, node.resourceId, finalNotes);
      return { payload: input };
    }

    // End the session that triggered this run; never somebody else's when that one is already gone.
    const { session: activeUsage } = await resolveTriggeringUsage(
      this.resourceUsageService,
      node.resourceId,
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
      node.resourceId,
      activeUsage.user,
      { notes: finalNotes, usageId: activeUsage.id },
      {
        skipFormSubmissions: true,
        skipNoteNotification: true,
        auditOrigin: { actorId: null },
      },
    );

    return { payload: input };
  }

  /** Payload user first; button presses name only the pressing session, whose owner is the triggering user. */
  private async triggeringUserId(resourceId: number, input: object, ctx: NodeExecutionContext) {
    const fromPayload = triggeringUserIdFromPayload(input);
    if (fromPayload !== undefined) return fromPayload;
    const usageId = triggeringUsageId(input);
    if (usageId === undefined) return undefined;
    const sessions = await this.resourceUsageService.getActiveSessionsForResource(resourceId, ctx.transactionManager);
    return sessions.find(({ id }) => id === usageId)?.userId ?? undefined;
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
