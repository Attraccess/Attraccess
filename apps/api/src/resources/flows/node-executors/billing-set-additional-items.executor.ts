import { Logger } from '@nestjs/common';
import { DatabaseTransactions, TransactionScope } from '../../../database/transaction-scope';
import { BILLING_OPERATIONS } from '../../../billing/persistence/port';
import { ResourceFlowNode, BillingTransactionItemCreateSchema } from '@attraccess/application-models';
import { ResourceUsageService } from '../../usage/sessions/resource-usage.service';
import { NoUsageSessionError } from '../errors/no-usage-session.error';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class BillingSetAdditionalItemsExecutor implements NodeExecutor {
  private readonly logger = new Logger(BillingSetAdditionalItemsExecutor.name);

  constructor(
    private readonly resourceUsageService: ResourceUsageService,
    private readonly transactions: DatabaseTransactions,
  ) {}

  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    const candidateUsageId = 'id' in input ? input.id : undefined;
    const usageId =
      typeof candidateUsageId === 'number' && Number.isSafeInteger(candidateUsageId) && candidateUsageId > 0
        ? candidateUsageId
        : undefined;
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
      await this.resourceUsageService.stageLifecycleBillingItem(ctx.lifecycleAttemptId, node.resourceId, usageId, {
        ...item,
        externalReference: externalReference ?? null,
      });
      return { payload: item };
    }

    const savePendingItem = async (manager: TransactionScope): Promise<void> => {
      const activeUsageSession = usageId
        ? undefined
        : await this.resourceUsageService.getActiveSession(node.resourceId, manager);
      if (!usageId && !activeUsageSession) {
        throw new NoUsageSessionError();
      }

      const persistence = manager.resolve(BILLING_OPERATIONS);
      const billingTransaction = await persistence.pendingUsageTransaction(
        node.resourceId,
        usageId ?? activeUsageSession.id,
      );

      if (!billingTransaction) {
        throw new NoUsageSessionError();
      }

      const dedupData = {
        billingTransactionId: billingTransaction.id,
        name: data.name,
        description: data.description,
        externalReference,
        unitPrice: data.unitPrice,
      };

      const existingItem = await persistence.matchingPendingItem(billingTransaction.id, {
        name: dedupData.name,
        description: dedupData.description,
        externalReference: dedupData.externalReference,
        unitPrice: dedupData.unitPrice,
      });

      if (existingItem) {
        await persistence.updateItemQuantity(existingItem.id, existingItem.quantity + quantity);
      } else {
        await persistence.saveItem({ ...dedupData, quantity });
      }
    };

    // Share finalization's write queue and explicit parent scope, without independent commits.
    await this.transactions.run(
      { resourceIds: [node.resourceId], accountIds: [] },
      savePendingItem,
      ctx.transactionManager,
    );

    return { payload: item };
  }
}
