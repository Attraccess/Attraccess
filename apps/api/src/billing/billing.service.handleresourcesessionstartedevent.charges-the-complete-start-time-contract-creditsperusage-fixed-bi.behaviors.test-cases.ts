import {
  BillingTransactionItem,
  ResourceBillingConfiguration,
  ResourceUsage,
  BillingTransaction,
  ResourceUsageAction,
  User,
} from '@attraccess/database-entities';
import { registerHandleresourcesessionstartedeventScopeFixture } from './billing.service.handleresourcesessionstartedevent-0de7ba.test-fixture';

export function registerChargesTheCompleteStartTimeContractCreditsperusageFixedBiCases(
  fixture: ReturnType<typeof registerHandleresourcesessionstartedeventScopeFixture>,
) {
  it.each([
    { creditsPerUsage: 6, billingFactor: 50, expectedCharge: 15 },
    { creditsPerUsage: 0, billingFactor: 100, expectedCharge: 24 },
    { creditsPerUsage: 6, billingFactor: 0, expectedCharge: 0 },
  ])('charges the complete start-time contract ($creditsPerUsage fixed, $billingFactor%)', async (contract) => {
    const usage = {
      id: 22,
      startTime: new Date('2026-09-20T09:00:00Z'),
      endTime: new Date('2026-09-20T09:02:00Z'),
      usageInMinutes: 2,
      attributedOperatingDurationInMinutes: 1,
      sessionDurationCreditsPerMinute: 10,
      operatingDurationCreditsPerMinute: 4,
      creditsPerUsage: contract.creditsPerUsage,
      billingFactor: contract.billingFactor,
      resource: { id: 205 },
      userId: 25,
      user: { id: 25, billingFactor: 200 },
    } as ResourceUsage;
    jest.spyOn(fixture.fixture.service, 'getResourceBillingConfiguration').mockResolvedValue({
      creditsPerUsage: 99,
      creditsPerMinute: 99,
      creditsPerOperatingMinute: 99,
    } as ResourceBillingConfiguration);
    const manager = fixture.createMockManager();

    const transaction = await fixture.fixture.service.chargeForResourceUsage(usage, manager as never);

    expect(transaction.amount).toBe(-contract.expectedCharge);
    expect(manager.save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ name: 'PER_SESSION', unitPrice: contract.creditsPerUsage, quantity: 1 }),
    );
    if (contract.billingFactor !== 100) {
      expect(manager.save).toHaveBeenCalledWith(
        BillingTransactionItem,
        expect.objectContaining({ name: 'BILLING_FACTOR', description: `${contract.billingFactor}%` }),
      );
    }
  });
}

export function registerCreatesANegativeBillingTransactionWhenCredits0Part5Cases(
  fixture: ReturnType<typeof registerHandleresourcesessionstartedeventScopeFixture>,
) {
  it('creates a negative billing transaction when credits > 0', async () => {
    const usage = {
      id: 13,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-09-20T09:07:36.000Z'),
      endTime: new Date('2026-09-20T09:10:00.000Z'),
      usageInMinutes: 2.4,
      resource: { id: 102 },
      userId: 10,
      user: {
        id: 10,
        billingFactor: 100,
      } as User,
    } as unknown as ResourceUsage;

    // ceil(2.4) = 3 -> 3 * 10 + 5 = 35 credits
    jest
      .spyOn(fixture.fixture.service, 'getResourceBillingConfiguration')
      .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 5 } as ResourceBillingConfiguration);

    fixture.fixture.billingTransactionRepository.save.mockResolvedValue({ id: 999 } as BillingTransaction);

    const transaction = await fixture.fixture.service.chargeForResourceUsage(
      usage as ResourceUsage,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fixture.createMockManager() as any,
    );

    expect(fixture.fixture.service.getResourceBillingConfiguration).toHaveBeenCalledWith(102, expect.any(Object));
    // A caller-owned transaction returns the charge without publishing it before commit.
    expect(transaction).toEqual(expect.objectContaining({ id: 999, amount: -35, userId: 10, resourceUsageId: 13 }));
    expect(fixture.fixture.liveNotificationsService.notifyTransactionUpdate).not.toHaveBeenCalled();
    expect(fixture.fixture.emailService.sendResourceUsageBillingSummaryEmail).not.toHaveBeenCalled();
  });
}

export function registerCreatesZeroAmountTransactionWhenBillingfactorIs0AndInserPart9Cases(
  fixture: ReturnType<typeof registerHandleresourcesessionstartedeventScopeFixture>,
) {
  it('creates zero-amount transaction when billingFactor is 0% and inserts a negative BILLING_FACTOR item', async () => {
    const usage = {
      id: 17,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-09-20T09:07:00.000Z'),
      endTime: new Date('2026-09-20T09:10:00.000Z'),
      usageInMinutes: 3,
      resource: { id: 203 },
      userId: 23,
      user: {
        id: 23,
        billingFactor: 0,
      } as User,
    } as unknown as ResourceUsage;

    jest
      .spyOn(fixture.fixture.service, 'getResourceBillingConfiguration')
      .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 0 } as ResourceBillingConfiguration);

    const manager = {
      findOneBy: jest.fn().mockResolvedValue(null),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest
        .fn()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation(async (entity: unknown, data: any) => {
          if (data && 'status' in data && 'amount' in data) {
            return { id: 1004, ...data };
          }
          return data;
        }),
    } as unknown as {
      findOneBy: jest.Mock;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findOne: jest.Mock<any, any>;
      update: jest.Mock;
      save: jest.Mock;
    };

    // base = 30, factor 0% -> total 0
    const transaction = await fixture.fixture.service.chargeForResourceUsage(
      usage as ResourceUsage,
      manager as unknown as never,
    );

    // Handle -0 vs 0 by checking numerically
    expect(transaction).toBeDefined();
    expect(transaction.amount).toBeCloseTo(0);

    expect(manager.save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ name: 'BILLING_FACTOR', unitPrice: -30, quantity: 1 }),
    );
  });
}

export function registerDoesNotCreateBillingFactorItemWhenBillingfactorIs100Part7Cases(
  fixture: ReturnType<typeof registerHandleresourcesessionstartedeventScopeFixture>,
) {
  it('does not create BILLING_FACTOR item when billingFactor is 100%', async () => {
    const usage = {
      id: 15,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-09-20T09:07:00.000Z'),
      endTime: new Date('2026-09-20T09:10:00.000Z'),
      usageInMinutes: 3,
      resource: { id: 201 },
      userId: 21,
      user: {
        id: 21,
        billingFactor: 100,
      } as User,
    } as unknown as ResourceUsage;

    jest
      .spyOn(fixture.fixture.service, 'getResourceBillingConfiguration')
      .mockResolvedValue({ creditsPerMinute: 10, creditsPerUsage: 5 } as ResourceBillingConfiguration);

    const manager = {
      findOneBy: jest.fn().mockResolvedValue(null),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest
        .fn()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation(async (entity: unknown, data: any) => {
          if (data && 'status' in data && 'amount' in data) {
            return { id: 1002, ...data };
          }
          return data;
        }),
    } as unknown as {
      findOneBy: jest.Mock;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findOne: jest.Mock<any, any>;
      update: jest.Mock;
      save: jest.Mock;
    };

    // ceil(3) = 3 -> 3 * 10 + 5 = 35 credits; 100% factor -> 35
    const transaction = await fixture.fixture.service.chargeForResourceUsage(
      usage as ResourceUsage,
      manager as unknown as never,
    );
    expect(transaction.amount).toBe(-35);

    const saves = (manager.save as jest.Mock).mock.calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map(([, data]: any[]) => data);
    const hasBillingFactor = saves.some((c) => c && c.name === 'BILLING_FACTOR');
    expect(hasBillingFactor).toBe(false);
  });
}

export function registerDoesNothingWhenComputedCreditsAreZeroPart4Cases(
  fixture: ReturnType<typeof registerHandleresourcesessionstartedeventScopeFixture>,
) {
  it('does nothing when computed credits are zero', async () => {
    const usage = {
      id: 12,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-09-20T09:05:00.000Z'),
      endTime: new Date('2026-09-20T09:10:00.000Z'),
      usageInMinutes: 5,
      resource: { id: 101 },
      userId: 9,
    } as unknown as ResourceUsage;

    jest
      .spyOn(fixture.fixture.service, 'getResourceBillingConfiguration')
      .mockResolvedValue({ creditsPerMinute: 0, creditsPerUsage: 0 } as ResourceBillingConfiguration);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await fixture.fixture.service.chargeForResourceUsage(usage as ResourceUsage, fixture.createMockManager() as any);

    expect(fixture.fixture.service.getResourceBillingConfiguration).toHaveBeenCalledWith(101, expect.any(Object));
    expect(fixture.fixture.billingTransactionRepository.save).not.toHaveBeenCalled();
  });
}
