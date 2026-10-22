import {
  billingOperationsFake,
  billingTransactionsFake,
} from '../../../billing/charges/fixtures/operations.test-fixture';
import { BillingPersistence } from '../../../billing/persistence/port';
import { TransactionScope } from '../../../database/transaction-scope';
import { Logger } from '@nestjs/common';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/application-models';
import { ResourceUsageService } from '../../usage/sessions/resource-usage.service';
import { NoUsageSessionError } from '../errors/no-usage-session.error';
import { BillingSetAdditionalItemsExecutor } from './billing-set-additional-items.executor';
import { NodeExecutionContext } from './node-executor.interface';

describe('BillingSetAdditionalItemsExecutor', () => {
  let executor: BillingSetAdditionalItemsExecutor;
  let resourceUsageService: { getActiveSession: jest.Mock; stageLifecycleBillingItem: jest.Mock };
  let operations: jest.Mocked<BillingPersistence>;
  let ctx: NodeExecutionContext;
  let persistenceFixture: ReturnType<typeof billingTransactionsFake>;
  const runExecutor = (node: ResourceFlowNode, input: object, context: NodeExecutionContext) => {
    if (!context.transactionManager) return executor.execute(node, input, context);
    return persistenceFixture.transactions.run({ resourceIds: [node.resourceId], accountIds: [] }, (scope) => {
      context.transactionManager = scope;
      return executor.execute(node, input, context);
    });
  };

  const createNode = (data: object): ResourceFlowNode =>
    ({
      id: 'n1',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
      resourceId: 1,
      data,
    }) as unknown as ResourceFlowNode;

  const baseData = {
    name: 'kWh',
    description: 'Energy',
    externalReference: 'power',
    unitPrice: 5,
    quantity: 2,
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    resourceUsageService = {
      getActiveSession: jest.fn().mockResolvedValue({ id: 'ru-1' }),
      stageLifecycleBillingItem: jest.fn().mockResolvedValue(undefined),
    };

    operations = billingOperationsFake();
    ctx = {
      transactionManager: {} as TransactionScope,
      compileTemplate: jest.fn((tpl: string) => tpl),
      getTemplateVariables: jest.fn(),
      setTemplateVariables: jest.fn(),
    } as unknown as NodeExecutionContext;

    persistenceFixture = billingTransactionsFake(operations);
    executor = new BillingSetAdditionalItemsExecutor(
      resourceUsageService as unknown as ResourceUsageService,
      persistenceFixture.transactions,
    );
  });

  it('throws NoUsageSessionError when there is no active session', async () => {
    resourceUsageService.getActiveSession.mockResolvedValue(null);

    await expect(runExecutor(createNode(baseData), {}, ctx)).rejects.toBeInstanceOf(NoUsageSessionError);
    expect(resourceUsageService.getActiveSession).toHaveBeenCalledWith(1, ctx.transactionManager);
    expect(operations.pendingUsageTransaction).not.toHaveBeenCalled();
  });

  it('saves a new item using static node data when no existing item matches', async () => {
    operations.pendingUsageTransaction.mockResolvedValueOnce({ id: 99 } as never);
    operations.matchingPendingItem.mockResolvedValueOnce(null as never); // existing item lookup -> none

    const result = await runExecutor(createNode(baseData), {}, ctx);

    expect(operations.pendingUsageTransaction).toHaveBeenCalledWith(1, 'ru-1');
    expect(operations.matchingPendingItem).toHaveBeenCalledWith(99, {
      name: 'kWh',
      description: 'Energy',
      externalReference: 'power',
      unitPrice: 5,
    });
    expect(operations.saveItem).toHaveBeenCalledWith({
      billingTransactionId: 99,
      name: 'kWh',
      description: 'Energy',
      externalReference: 'power',
      unitPrice: 5,
      quantity: 2,
    });
    expect(operations.updateItemQuantity).not.toHaveBeenCalled();
    expect(result).toEqual({
      payload: {
        name: 'kWh',
        description: 'Energy',
        externalReference: 'power',
        unitPrice: 5,
        quantity: 2,
      },
    });
  });

  it.each([12, undefined])('stages lifecycle billing for usage %s without touching active billing', async (id) => {
    ctx.lifecycleAttemptId = 'lifecycle-attempt';
    resourceUsageService.getActiveSession.mockResolvedValue(null);
    (ctx.compileTemplate as jest.Mock).mockReturnValue('meter-1');

    const result = await runExecutor(createNode(baseData), { id, quantity: '4', externalReference: 'meter' }, ctx);

    expect(resourceUsageService.stageLifecycleBillingItem).toHaveBeenCalledWith('lifecycle-attempt', 1, id, {
      ...baseData,
      quantity: 4,
      externalReference: 'meter-1',
    });
    expect(resourceUsageService.getActiveSession).not.toHaveBeenCalled();
    expect(operations.pendingUsageTransaction).not.toHaveBeenCalled();
    expect(operations.saveItem).not.toHaveBeenCalled();
    expect(result).toEqual({ payload: { ...baseData, quantity: 4, externalReference: 'meter-1' } });
  });

  it('propagates a rejected lifecycle attempt without writing billing items', async () => {
    ctx.lifecycleAttemptId = 'stale-attempt';
    resourceUsageService.stageLifecycleBillingItem.mockRejectedValueOnce(
      new Error('Lifecycle attempt is no longer pending'),
    );

    await expect(runExecutor(createNode(baseData), { id: 12 }, ctx)).rejects.toThrow(
      'Lifecycle attempt is no longer pending',
    );
    expect(operations.saveItem).not.toHaveBeenCalled();
    expect(operations.updateItemQuantity).not.toHaveBeenCalled();
  });

  it('uses the usage ID in stopped-session flow input', async () => {
    operations.pendingUsageTransaction.mockResolvedValueOnce({ id: 99 } as never);
    operations.matchingPendingItem.mockResolvedValueOnce(null as never);

    await runExecutor(createNode(baseData), { id: 12 }, ctx);

    expect(resourceUsageService.getActiveSession).not.toHaveBeenCalled();
    expect(operations.pendingUsageTransaction).toHaveBeenCalledWith(1, 12);
  });

  it('falls back to the active session for an invalid stopped-session ID', async () => {
    operations.pendingUsageTransaction.mockResolvedValueOnce({ id: 99 } as never);
    operations.matchingPendingItem.mockResolvedValueOnce(null as never);

    await runExecutor(createNode(baseData), { id: -1 }, ctx);

    expect(resourceUsageService.getActiveSession).toHaveBeenCalledWith(1, ctx.transactionManager);
    expect(operations.pendingUsageTransaction).toHaveBeenCalledWith(1, 'ru-1');
  });

  it('throws NoUsageSessionError when the usage has no billing transaction for the resource', async () => {
    operations.pendingUsageTransaction.mockResolvedValueOnce(null);

    await expect(runExecutor(createNode(baseData), { id: 12 }, ctx)).rejects.toBeInstanceOf(NoUsageSessionError);
    expect(operations.pendingUsageTransaction).toHaveBeenCalledWith(1, 12);
    expect(operations.saveItem).not.toHaveBeenCalled();
  });

  it('updates the existing item by summing the quantity', async () => {
    operations.pendingUsageTransaction.mockResolvedValueOnce({ id: 99 } as never);
    operations.matchingPendingItem.mockResolvedValueOnce({ id: 7, quantity: 3 } as never); // existing item

    const result = await runExecutor(createNode(baseData), {}, ctx);

    expect(operations.updateItemQuantity).toHaveBeenCalledWith(7, 5);
    expect(operations.saveItem).not.toHaveBeenCalled();
    expect(result.payload).toMatchObject({ quantity: 2 });
  });

  it('overrides quantity from input via schema coercion', async () => {
    operations.pendingUsageTransaction.mockResolvedValueOnce({ id: 99 } as never);
    operations.matchingPendingItem.mockResolvedValueOnce(null as never);

    const result = await runExecutor(createNode(baseData), { quantity: '10' }, ctx);

    expect(operations.saveItem).toHaveBeenCalledWith(expect.objectContaining({ quantity: 10 }));
    expect(result.payload).toMatchObject({ quantity: 10 });
  });

  it('overrides externalReference from input and recompiles the template when data has one', async () => {
    operations.pendingUsageTransaction.mockResolvedValueOnce({ id: 99 } as never);
    operations.matchingPendingItem.mockResolvedValueOnce(null as never);
    (ctx.compileTemplate as jest.Mock).mockReturnValue('compiled-ref');

    const input = { externalReference: 'override-value' };
    const result = await runExecutor(createNode(baseData), input, ctx);

    // data.externalReference is present -> recompiles data's template with input
    expect(ctx.compileTemplate).toHaveBeenCalledWith('power', input);
    expect(operations.matchingPendingItem).toHaveBeenCalledWith(
      99,
      expect.objectContaining({ externalReference: 'compiled-ref' }),
    );
    expect(operations.saveItem).toHaveBeenCalledWith(expect.objectContaining({ externalReference: 'compiled-ref' }));
    expect(result.payload).toMatchObject({ externalReference: 'compiled-ref' });
  });

  it('uses input externalReference verbatim when node data has no externalReference', async () => {
    operations.pendingUsageTransaction.mockResolvedValueOnce({ id: 99 } as never);
    operations.matchingPendingItem.mockResolvedValueOnce(null as never);

    const { name, description, unitPrice, quantity } = baseData;
    const dataNoRef = { name, description, unitPrice, quantity };
    const result = await runExecutor(createNode(dataNoRef), { externalReference: 'from-input' }, ctx);

    expect(ctx.compileTemplate).not.toHaveBeenCalled();
    expect(operations.saveItem).toHaveBeenCalledWith(expect.objectContaining({ externalReference: 'from-input' }));
    expect(result.payload).toMatchObject({ externalReference: 'from-input' });
  });

  it('ignores non-string input externalReference', async () => {
    operations.pendingUsageTransaction.mockResolvedValueOnce({ id: 99 } as never);
    operations.matchingPendingItem.mockResolvedValueOnce(null as never);

    await runExecutor(createNode(baseData), { externalReference: 123 }, ctx);

    expect(ctx.compileTemplate).not.toHaveBeenCalled();
    expect(operations.saveItem).toHaveBeenCalledWith(expect.objectContaining({ externalReference: 'power' }));
  });

  it('creates an owning transaction when no parent scope is provided', async () => {
    ctx.transactionManager = undefined;
    operations.pendingUsageTransaction.mockResolvedValueOnce({ id: 42 } as never);
    operations.matchingPendingItem.mockResolvedValueOnce(null as never);

    await runExecutor(createNode(baseData), {}, ctx);

    expect(resourceUsageService.getActiveSession).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ backend: 'fake', conflicts: { resourceIds: [1], accountIds: [] } }),
    );
    expect(operations.saveItem).toHaveBeenCalledWith(
      expect.objectContaining({ billingTransactionId: 42, quantity: 2 }),
    );
    expect(persistenceFixture.run).toHaveBeenCalledTimes(1);
  });

  it('throws when node data fails schema validation', async () => {
    await expect(runExecutor(createNode({ name: '', unitPrice: 5, quantity: 2 }), {}, ctx)).rejects.toThrow();
    expect(operations.pendingUsageTransaction).not.toHaveBeenCalled();
  });
});
