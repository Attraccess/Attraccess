import { Logger } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import {
  ResourceFlowNode,
  ResourceFlowNodeType,
  BillingTransaction,
  BillingTransactionItem,
} from '@attraccess/database-entities';
import { ResourceUsageService } from '../../usage/resourceUsage.service';
import { NoUsageSessionError } from '../errors/no-usage-session.error';
import { BillingSetAdditionalItemsExecutor } from './billing-set-additional-items.executor';
import { NodeExecutionContext } from './node-executor.interface';

describe('BillingSetAdditionalItemsExecutor', () => {
  let executor: BillingSetAdditionalItemsExecutor;
  let resourceUsageService: { getActiveSession: jest.Mock };
  let manager: { findOne: jest.Mock; update: jest.Mock; save: jest.Mock };
  let repoManager: { findOne: jest.Mock; update: jest.Mock; save: jest.Mock };
  let billingItemRepository: Repository<BillingTransactionItem>;
  let ctx: NodeExecutionContext;

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
    };

    manager = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    };

    // Distinct manager on the repository to verify the fallback path.
    repoManager = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    };

    billingItemRepository = {
      manager: repoManager as unknown as EntityManager,
    } as unknown as Repository<BillingTransactionItem>;

    ctx = {
      transactionManager: manager as unknown as EntityManager,
      compileTemplate: jest.fn((tpl: string) => tpl),
      getTemplateVariables: jest.fn(),
      setTemplateVariables: jest.fn(),
    } as unknown as NodeExecutionContext;

    executor = new BillingSetAdditionalItemsExecutor(
      resourceUsageService as unknown as ResourceUsageService,
      billingItemRepository,
    );
  });

  it('throws NoUsageSessionError when there is no active session', async () => {
    resourceUsageService.getActiveSession.mockResolvedValue(null);

    await expect(executor.execute(createNode(baseData), {}, ctx)).rejects.toBeInstanceOf(NoUsageSessionError);
    expect(resourceUsageService.getActiveSession).toHaveBeenCalledWith(1, false, ctx.transactionManager);
    expect(manager.findOne).not.toHaveBeenCalled();
  });

  it('saves a new item using static node data when no existing item matches', async () => {
    manager.findOne
      .mockResolvedValueOnce({ id: 99 }) // BillingTransaction lookup
      .mockResolvedValueOnce(null); // existing item lookup -> none

    const result = await executor.execute(createNode(baseData), {}, ctx);

    expect(manager.findOne).toHaveBeenNthCalledWith(1, BillingTransaction, {
      where: { resourceUsageId: 'ru-1' },
    });
    expect(manager.findOne).toHaveBeenNthCalledWith(2, BillingTransactionItem, {
      where: {
        billingTransactionId: 99,
        name: 'kWh',
        description: 'Energy',
        externalReference: 'power',
        unitPrice: 5,
      },
    });
    expect(manager.save).toHaveBeenCalledWith(BillingTransactionItem, {
      billingTransactionId: 99,
      name: 'kWh',
      description: 'Energy',
      externalReference: 'power',
      unitPrice: 5,
      quantity: 2,
    });
    expect(manager.update).not.toHaveBeenCalled();
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

  it('uses the usage ID in stopped-session flow input', async () => {
    manager.findOne.mockResolvedValueOnce({ id: 99 }).mockResolvedValueOnce(null);

    await executor.execute(createNode(baseData), { id: 12 }, ctx);

    expect(resourceUsageService.getActiveSession).not.toHaveBeenCalled();
    expect(manager.findOne).toHaveBeenNthCalledWith(1, BillingTransaction, {
      where: { resourceUsageId: 12 },
    });
  });

  it('updates the existing item by summing the quantity', async () => {
    manager.findOne
      .mockResolvedValueOnce({ id: 99 }) // transaction
      .mockResolvedValueOnce({ id: 7, quantity: 3 }); // existing item

    const result = await executor.execute(createNode(baseData), {}, ctx);

    expect(manager.update).toHaveBeenCalledWith(BillingTransactionItem, 7, {
      quantity: 5, // existing 3 + data 2
    });
    expect(manager.save).not.toHaveBeenCalled();
    expect(result.payload).toMatchObject({ quantity: 2 });
  });

  it('overrides quantity from input via schema coercion', async () => {
    manager.findOne.mockResolvedValueOnce({ id: 99 }).mockResolvedValueOnce(null);

    const result = await executor.execute(createNode(baseData), { quantity: '10' }, ctx);

    expect(manager.save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ quantity: 10 }),
    );
    expect(result.payload).toMatchObject({ quantity: 10 });
  });

  it('overrides externalReference from input and recompiles the template when data has one', async () => {
    manager.findOne.mockResolvedValueOnce({ id: 99 }).mockResolvedValueOnce(null);
    (ctx.compileTemplate as jest.Mock).mockReturnValue('compiled-ref');

    const input = { externalReference: 'override-value' };
    const result = await executor.execute(createNode(baseData), input, ctx);

    // data.externalReference is present -> recompiles data's template with input
    expect(ctx.compileTemplate).toHaveBeenCalledWith('power', input);
    expect(manager.findOne).toHaveBeenNthCalledWith(2, BillingTransactionItem, {
      where: expect.objectContaining({ externalReference: 'compiled-ref' }),
    });
    expect(manager.save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ externalReference: 'compiled-ref' }),
    );
    expect(result.payload).toMatchObject({ externalReference: 'compiled-ref' });
  });

  it('uses input externalReference verbatim when node data has no externalReference', async () => {
    manager.findOne.mockResolvedValueOnce({ id: 99 }).mockResolvedValueOnce(null);

    const { name, description, unitPrice, quantity } = baseData;
    const dataNoRef = { name, description, unitPrice, quantity };
    const result = await executor.execute(createNode(dataNoRef), { externalReference: 'from-input' }, ctx);

    expect(ctx.compileTemplate).not.toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ externalReference: 'from-input' }),
    );
    expect(result.payload).toMatchObject({ externalReference: 'from-input' });
  });

  it('ignores non-string input externalReference', async () => {
    manager.findOne.mockResolvedValueOnce({ id: 99 }).mockResolvedValueOnce(null);

    await executor.execute(createNode(baseData), { externalReference: 123 }, ctx);

    expect(ctx.compileTemplate).not.toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ externalReference: 'power' }),
    );
  });

  it('falls back to the repository manager when no transaction manager is provided', async () => {
    ctx.transactionManager = undefined;
    repoManager.findOne.mockResolvedValueOnce({ id: 42 }).mockResolvedValueOnce(null);

    await executor.execute(createNode(baseData), {}, ctx);

    expect(resourceUsageService.getActiveSession).toHaveBeenCalledWith(1, false, undefined);
    expect(repoManager.save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ billingTransactionId: 42, quantity: 2 }),
    );
    expect(manager.findOne).not.toHaveBeenCalled();
  });

  it('throws when node data fails schema validation', async () => {
    await expect(executor.execute(createNode({ name: '', unitPrice: 5, quantity: 2 }), {}, ctx)).rejects.toThrow();
    expect(manager.findOne).not.toHaveBeenCalled();
  });
});
