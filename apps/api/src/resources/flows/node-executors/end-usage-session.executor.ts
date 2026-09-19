import { ResourceFlowNode, ResourceUsageEndSessionNodeDataSchema } from '@attraccess/database-entities';
import { ResourceUsageService } from '../../usage/resourceUsage.service';
import { FlowExecutionError } from '../errors/flow-execution.error';
import { NoUsageSessionError } from '../errors/no-usage-session.error';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class EndUsageSessionExecutor implements NodeExecutor {
  constructor(private readonly resourceUsageService: ResourceUsageService) {}

  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    const { notes } = ResourceUsageEndSessionNodeDataSchema.parse(node.data ?? {});

    let finalNotes = '';
    if (typeof notes === 'string' && notes.length > 0) {
      const compiled = ctx.compileTemplate(notes, input);
      finalNotes = compiled && compiled.trim().length > 0 ? compiled : notes;
    }

    if (ctx.lifecycleAttemptId) {
      // The stopped flow may include an end-session node; it has already claimed the candidate.
      if (ctx.lifecycleCandidateCancellation) return { payload: input };
      await this.resourceUsageService.endLifecycleCandidate(ctx.lifecycleAttemptId, node.resourceId, finalNotes);
      return { payload: input };
    }

    const activeUsage = await this.resourceUsageService.getActiveSession(node.resourceId, false, ctx.transactionManager);

    if (!activeUsage) {
      throw new NoUsageSessionError();
    }

    if (!activeUsage.user) {
      throw new FlowExecutionError('Active session has no owner user; cannot end');
    }

    await this.resourceUsageService.endSession(
      node.resourceId,
      activeUsage.user,
      { notes: finalNotes },
      {
        skipFormSubmissions: true,
        skipNoteNotification: true,
        auditOrigin: { actorId: null },
      },
    );

    return { payload: input };
  }
}
