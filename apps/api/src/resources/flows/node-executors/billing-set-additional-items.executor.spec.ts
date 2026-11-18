import { Logger } from '@nestjs/common';
import { FlowNodeRecord, ResourceFlowNodeType } from '@attraccess/application-models';
import type { TransactionScope, UnitOfWork } from '../../../database/unit-of-work';
import { ResourceUsageService } from '../../usage/sessions/resource-usage.service';
import { NoUsageSessionError } from '../errors/no-usage-session.error';
import type { FlowBillingItemStore } from '../flow-billing-item-store.port';
import { BillingSetAdditionalItemsExecutor } from './billing-set-additional-items.executor';
import { NodeExecutionContext } from './node-executor.interface';

describe('BillingSetAdditionalItemsExecutor', () => {
  let executor: BillingSetAdditionalItemsExecutor;
  let resourceUsageService: { getActiveSessionsForResource: jest.Mock; stageLifecycleBillingItem: jest.Mock };
  let billingItems: { addToPendingBill: jest.Mock };
  let unitOfWork: { run: jest.Mock; current: jest.Mock };
  const scope = { isOpen: true, afterCommit: jest.fn() } as TransactionScope;
  const callerTransaction = { callersTransaction: true };
  let ctx: NodeExecutionContext;

  const createNode = (data: object): FlowNodeRecord =>
    ({
      id: 'n1',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
      resourceId: 1,
      data,
    }) as unknown as FlowNodeRecord;

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
      getActiveSessionsForResource: jest.fn().mockResolvedValue([{ id: 'ru-1' }]),
      stageLifecycleBillingItem: jest.fn().mockResolvedValue(undefined),
    };
    billingItems = { addToPendingBill: jest.fn().mockResolvedValue(true) };
    unitOfWork = {
      run: jest.fn(async (work: (scope: TransactionScope) => Promise<unknown>) => work(scope)),
      current: jest.fn(),
    };

    ctx = {
      transactionManager: callerTransaction,
      compileTemplate: jest.fn((tpl: string) => tpl),
      getTemplateVariables: jest.fn(),
      setTemplateVariables: jest.fn(),
    } as unknown as NodeExecutionContext;

    executor = new BillingSetAdditionalItemsExecutor(
      resourceUsageService as unknown as ResourceUsageService,
      billingItems as unknown as FlowBillingItemStore,
      unitOfWork as unknown as UnitOfWork,
    );
  });

  const itemOf = (overrides: object = {}) => ({
    name: 'kWh',
    description: 'Energy',
    externalReference: 'power',
    unitPrice: 5,
    quantity: 2,
    ...overrides,
  });

  it('throws NoUsageSessionError when there is no active session', async () => {
    resourceUsageService.getActiveSessionsForResource.mockResolvedValue([]);

    await expect(executor.execute(createNode(baseData), {}, ctx)).rejects.toBeInstanceOf(NoUsageSessionError);
    expect(resourceUsageService.getActiveSessionsForResource).toHaveBeenCalledWith(1, callerTransaction);
    expect(billingItems.addToPendingBill).not.toHaveBeenCalled();
  });

  it('adds a new item using static node data to the active session in the caller transaction', async () => {
    const result = await executor.execute(createNode(baseData), {}, ctx);

    expect(billingItems.addToPendingBill).toHaveBeenCalledWith(
      { usageId: 'ru-1', resourceId: 1 },
      itemOf(),
      callerTransaction,
    );
    expect(unitOfWork.run).not.toHaveBeenCalled();
    expect(result).toEqual({ payload: itemOf() });
  });

  it.each([12, undefined])('stages lifecycle billing for usage %s without touching active billing', async (id) => {
    ctx.lifecycleAttemptId = 'lifecycle-attempt';
    resourceUsageService.getActiveSessionsForResource.mockResolvedValue([]);
    (ctx.compileTemplate as jest.Mock).mockReturnValue('meter-1');

    const result = await executor.execute(createNode(baseData), { id, quantity: '4', externalReference: 'meter' }, ctx);

    expect(resourceUsageService.stageLifecycleBillingItem).toHaveBeenCalledWith('lifecycle-attempt', 1, id, {
      ...baseData,
      quantity: 4,
      externalReference: 'meter-1',
    });
    expect(resourceUsageService.getActiveSessionsForResource).not.toHaveBeenCalled();
    expect(billingItems.addToPendingBill).not.toHaveBeenCalled();
    expect(result).toEqual({ payload: { ...baseData, quantity: 4, externalReference: 'meter-1' } });
  });

  it('propagates a rejected lifecycle attempt without writing billing items', async () => {
    ctx.lifecycleAttemptId = 'stale-attempt';
    resourceUsageService.stageLifecycleBillingItem.mockRejectedValueOnce(
      new Error('Lifecycle attempt is no longer pending'),
    );

    await expect(executor.execute(createNode(baseData), { id: 12 }, ctx)).rejects.toThrow(
      'Lifecycle attempt is no longer pending',
    );
    expect(billingItems.addToPendingBill).not.toHaveBeenCalled();
  });

  it('uses the usage ID in stopped-session flow input', async () => {
    await executor.execute(createNode(baseData), { id: 12 }, ctx);

    expect(billingItems.addToPendingBill).toHaveBeenCalledWith(
      { usageId: 12, resourceId: 1 },
      itemOf(),
      callerTransaction,
    );
  });

  it('falls back to the active session for an invalid stopped-session ID', async () => {
    await executor.execute(createNode(baseData), { id: -1 }, ctx);

    expect(resourceUsageService.getActiveSessionsForResource).toHaveBeenCalledWith(1, callerTransaction);
    expect(billingItems.addToPendingBill).toHaveBeenCalledWith(
      { usageId: 'ru-1', resourceId: 1 },
      itemOf(),
      callerTransaction,
    );
  });

  it('throws NoUsageSessionError when the usage has no pending billing transaction for the resource', async () => {
    billingItems.addToPendingBill.mockResolvedValueOnce(false);

    await expect(executor.execute(createNode(baseData), { id: 12 }, ctx)).rejects.toBeInstanceOf(NoUsageSessionError);
    expect(billingItems.addToPendingBill).toHaveBeenCalledWith(
      { usageId: 12, resourceId: 1 },
      itemOf(),
      callerTransaction,
    );
  });

  it('overrides quantity from input via schema coercion', async () => {
    const result = await executor.execute(createNode(baseData), { quantity: '10' }, ctx);

    expect(billingItems.addToPendingBill).toHaveBeenCalledWith(
      expect.anything(),
      itemOf({ quantity: 10 }),
      callerTransaction,
    );
    expect(result.payload).toMatchObject({ quantity: 10 });
  });

  it('overrides externalReference from input and recompiles the template when data has one', async () => {
    (ctx.compileTemplate as jest.Mock).mockReturnValue('compiled-ref');

    const input = { externalReference: 'override-value' };
    const result = await executor.execute(createNode(baseData), input, ctx);

    // data.externalReference is present -> recompiles data's template with input
    expect(ctx.compileTemplate).toHaveBeenCalledWith('power', input);
    expect(billingItems.addToPendingBill).toHaveBeenCalledWith(
      expect.anything(),
      itemOf({ externalReference: 'compiled-ref' }),
      callerTransaction,
    );
    expect(result.payload).toMatchObject({ externalReference: 'compiled-ref' });
  });

  it('uses input externalReference verbatim when node data has no externalReference', async () => {
    const { name, description, unitPrice, quantity } = baseData;
    const dataNoRef = { name, description, unitPrice, quantity };
    const result = await executor.execute(createNode(dataNoRef), { externalReference: 'from-input' }, ctx);

    expect(ctx.compileTemplate).not.toHaveBeenCalled();
    expect(billingItems.addToPendingBill).toHaveBeenCalledWith(
      expect.anything(),
      itemOf({ externalReference: 'from-input' }),
      callerTransaction,
    );
    expect(result.payload).toMatchObject({ externalReference: 'from-input' });
  });

  it('ignores non-string input externalReference', async () => {
    await executor.execute(createNode(baseData), { externalReference: 123 }, ctx);

    expect(ctx.compileTemplate).not.toHaveBeenCalled();
    expect(billingItems.addToPendingBill).toHaveBeenCalledWith(
      expect.anything(),
      itemOf({ externalReference: 'power' }),
      callerTransaction,
    );
  });

  it('opens its own unit of work when no transaction is provided', async () => {
    ctx.transactionManager = undefined;

    await executor.execute(createNode(baseData), {}, ctx);

    expect(unitOfWork.run).toHaveBeenCalledTimes(1);
    expect(resourceUsageService.getActiveSessionsForResource).toHaveBeenCalledWith(1, scope);
    expect(billingItems.addToPendingBill).toHaveBeenCalledWith({ usageId: 'ru-1', resourceId: 1 }, itemOf(), scope);
  });

  it('throws when node data fails schema validation', async () => {
    await expect(executor.execute(createNode({ name: '', unitPrice: 5, quantity: 2 }), {}, ctx)).rejects.toThrow();
    expect(billingItems.addToPendingBill).not.toHaveBeenCalled();
  });

  describe('on a machine shared by several people', () => {
    const shared = { type: 'machine', maxParallelSessions: 3 };
    beforeEach(() => {
      resourceUsageService.getActiveSessionsForResource.mockResolvedValue([
        { id: 5, resource: shared },
        { id: 6, resource: shared },
      ]);
    });

    it('bills the triggering session named by usageId, preferring it over a generic id', async () => {
      await executor.execute(createNode(baseData), { usageId: 5, id: 6 }, ctx);

      expect(billingItems.addToPendingBill).toHaveBeenCalledWith(
        { usageId: 5, resourceId: 1 },
        itemOf(),
        callerTransaction,
      );
    });

    it('bills nobody when the triggering session already ended', async () => {
      await expect(executor.execute(createNode(baseData), { usageId: 4 }, ctx)).rejects.toBeInstanceOf(
        NoUsageSessionError,
      );
      expect(billingItems.addToPendingBill).not.toHaveBeenCalled();
    });
  });
});
