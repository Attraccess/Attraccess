import { Logger } from '@nestjs/common';
import { BillingTransactionItemCreateSchema, FlowNodeRecord } from '@attraccess/application-models';
import type { ResourceUsageService } from '../../usage/sessions/resource-usage.service';
import { NoUsageSessionError } from '../errors/no-usage-session.error';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';
import { resolveTriggeringUsage, triggeringUsageId } from './triggering-usage';
import { requireRunMachineId } from './flow.utils';
import type { UnitOfWork } from '../../../database/unit-of-work';
import type { TransactionContext } from '../../../database/transaction-context';
import type { FlowBillingItemStore } from '../flow-billing-item-store.port';

export class BillingSetAdditionalItemsExecutor implements NodeExecutor {
  private readonly logger = new Logger(BillingSetAdditionalItemsExecutor.name);

  constructor(
    private readonly resourceUsageService: ResourceUsageService,
    private readonly billingItems: FlowBillingItemStore,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(node: FlowNodeRecord, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    const resourceId = await requireRunMachineId(node, ctx);
    const usageId = triggeringUsageId(input);
    const data = BillingTransactionItemCreateSchema.parse(node.data);

    this.logger.debug(
      `Processing billing set additional items node with data: ${JSON.stringify({ data, input }, null, 2)}`,
    );

    let externalReference = data.externalReference;
    if ('externalReference' in input && typeof input.externalReference === 'string') {
      externalReference = input.externalReference;
      if (data.externalReference) {
        this.logger.debug(`Compiling external reference template: ${data.externalReference}`);
        externalReference = ctx.compileTemplate(
          BillingTransactionItemCreateSchema.shape.externalReference.parse(data.externalReference),
          input,
        );
      }
    }

    let quantity = data.quantity;
    if ('quantity' in input) {
      this.logger.debug(`Compiling quantity template: ${input.quantity}`);
      const numberQuantity = BillingTransactionItemCreateSchema.shape.quantity.parse(input.quantity);
      quantity = numberQuantity;
    }

    const item = {
      name: data.name,
      description: data.description,
      externalReference,
      unitPrice: data.unitPrice,
      quantity,
    };
    if (ctx.lifecycleAttemptId) {
      await this.resourceUsageService.stageLifecycleBillingItem(ctx.lifecycleAttemptId, resourceId, usageId, {
        ...item,
        externalReference: externalReference ?? null,
      });
      return { payload: item };
    }

    const savePendingItem = async (context: TransactionContext): Promise<void> => {
      // The triggering session, else the newest; nothing when the triggering session ended on a shared machine.
      const { session } = await resolveTriggeringUsage(this.resourceUsageService, resourceId, input, context);
      if (!session) {
        throw new NoUsageSessionError();
      }

      // A named session keeps its own pending transaction on a single-session machine, as before.
      const added = await this.billingItems.addToPendingBill(
        { usageId: usageId ?? session.id, resourceId },
        {
          name: data.name,
          description: data.description,
          externalReference,
          unitPrice: data.unitPrice,
          quantity,
        },
        context,
      );
      if (!added) {
        throw new NoUsageSessionError();
      }
    };

    if (ctx.transactionManager) {
      await savePendingItem(ctx.transactionManager);
    } else {
      // Share finalization's write queue so a delayed event cannot pass the status check
      // before finalization and then change its completed items afterward.
      await this.unitOfWork.run((scope) => savePendingItem(scope));
    }

    return { payload: item };
  }
}
