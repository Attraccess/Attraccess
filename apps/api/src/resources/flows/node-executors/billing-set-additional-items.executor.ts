import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  ResourceFlowNode,
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionItemCreateSchema,
} from '@attraccess/database-entities';
import { ResourceUsageService } from '../../usage/resourceUsage.service';
import { NoUsageSessionError } from '../errors/no-usage-session.error';
import { NodeExecutionContext, NodeExecutor, NodeProcessingResult } from './node-executor.interface';

export class BillingSetAdditionalItemsExecutor implements NodeExecutor {
  private readonly logger = new Logger(BillingSetAdditionalItemsExecutor.name);

  constructor(
    private readonly resourceUsageService: ResourceUsageService,
    private readonly billingTransactionItemRepository: Repository<BillingTransactionItem>,
  ) {}

  async execute(node: ResourceFlowNode, input: object, ctx: NodeExecutionContext): Promise<NodeProcessingResult> {
    const usageId = 'id' in input && typeof input.id === 'number' ? input.id : undefined;
    const activeUsageSession = usageId
      ? undefined
      : await this.resourceUsageService.getActiveSession(node.resourceId, false, ctx.transactionManager);

    if (!usageId && !activeUsageSession) {
      throw new NoUsageSessionError();
    }

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

    const manager = ctx.transactionManager ?? this.billingTransactionItemRepository.manager;

    const billingTransaction = await manager.findOne(BillingTransaction, {
      where: {
        resourceUsageId: usageId ?? activeUsageSession.id,
      },
    });

    const dedupData = {
      billingTransactionId: billingTransaction.id,
      name: data.name,
      description: data.description,
      externalReference,
      unitPrice: data.unitPrice,
    };

    const existingItem = await manager.findOne(BillingTransactionItem, {
      where: dedupData,
    });

    if (existingItem) {
      await manager.update(BillingTransactionItem, existingItem.id, {
        quantity: existingItem.quantity + quantity,
      });
    } else {
      await manager.save(BillingTransactionItem, {
        ...dedupData,
        quantity,
      });
    }

    return {
      payload: {
        name: data.name,
        description: data.description,
        externalReference,
        unitPrice: data.unitPrice,
        quantity,
      } as Omit<BillingTransactionItem, 'id' | 'billingTransactionId' | 'billingTransaction'>,
    };
  }
}
