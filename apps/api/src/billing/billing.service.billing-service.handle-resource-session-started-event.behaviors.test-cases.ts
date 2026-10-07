import { registerHandleresourcesessionstartedeventScopeFixture } from './billing.service.handleresourcesessionstartedevent-0de7ba.test-fixture';
import { registerAppliesBillingfactor100DiscountAndCreatesBillingFactorItePart6Cases } from './billing.service.billing-service.handle-resource-session-started-event.behaviors.test-cases';
import { registerAppliesBillingfactor100SurchargeAndCreatesPositiveBillingPart8Cases } from './billing.service.billing-service.handle-resource-session-started-event.behaviors.test-cases';
import { registerBillsAndRecordsExactDurationDurationmsMsIndependentlyForPart1Cases } from './billing.service.billing-service.handle-resource-session-started-event.behaviors.test-cases';
import { registerChargesTheCompleteStartTimeContractCreditsperusageFixedBiCases } from './billing.service.handleresourcesessionstartedevent.charges-the-complete-start-time-contract-creditsperusage-fixed-bi.behaviors.test-cases';
import { registerCreatesANegativeBillingTransactionWhenCredits0Part5Cases } from './billing.service.handleresourcesessionstartedevent.charges-the-complete-start-time-contract-creditsperusage-fixed-bi.behaviors.test-cases';
import { registerCreatesZeroAmountTransactionWhenBillingfactorIs0AndInserPart9Cases } from './billing.service.handleresourcesessionstartedevent.charges-the-complete-start-time-contract-creditsperusage-fixed-bi.behaviors.test-cases';
import { registerDoesNotCreateBillingFactorItemWhenBillingfactorIs100Part7Cases } from './billing.service.handleresourcesessionstartedevent.charges-the-complete-start-time-contract-creditsperusage-fixed-bi.behaviors.test-cases';
import { registerDoesNothingWhenComputedCreditsAreZeroPart4Cases } from './billing.service.handleresourcesessionstartedevent.charges-the-complete-start-time-contract-creditsperusage-fixed-bi.behaviors.test-cases';
import { registerIncludesExistingTransactionItemsInTotalAndUpdatesExistingPart10Cases } from './billing.service.handleresourcesessionstartedevent.includes-existing-transaction-items-in-total-and-updates-existing.behaviors.test-cases';
import { registerProcessesNonUsageActionsWithoutCreatingATransactionWhenCPart2Cases } from './billing.service.handleresourcesessionstartedevent.includes-existing-transaction-items-in-total-and-updates-existing.behaviors.test-cases';
import { registerProcessesNotEndedSessionWithoutCreatingATransactionWhenCPart3Cases } from './billing.service.handleresourcesessionstartedevent.includes-existing-transaction-items-in-total-and-updates-existing.behaviors.test-cases';
import { registerBillingServiceFixture } from './billing.service.billing-service.test-fixture';
import {
  BillingTransactionItem,
  ResourceBillingConfiguration,
  ResourceUsage,
  ResourceUsageAction,
  User,
  BillingTransactionStatus,
} from '@attraccess/database-entities';

export function registerHandleResourceSessionStartedEventCases(
  fixture: ReturnType<typeof registerBillingServiceFixture>,
) {
  describe('handleResourceSessionStartedEvent', () => {
    const scope = registerHandleresourcesessionstartedeventScopeFixture(fixture);
    registerChargesTheCompleteStartTimeContractCreditsperusageFixedBiCases(scope);
    registerBillsAndRecordsExactDurationDurationmsMsIndependentlyForPart1Cases(scope);
    registerProcessesNonUsageActionsWithoutCreatingATransactionWhenCPart2Cases(scope);
    registerProcessesNotEndedSessionWithoutCreatingATransactionWhenCPart3Cases(scope);
    registerDoesNothingWhenComputedCreditsAreZeroPart4Cases(scope);
    registerCreatesANegativeBillingTransactionWhenCredits0Part5Cases(scope);
    registerAppliesBillingfactor100DiscountAndCreatesBillingFactorItePart6Cases(scope);
    registerDoesNotCreateBillingFactorItemWhenBillingfactorIs100Part7Cases(scope);
    registerAppliesBillingfactor100SurchargeAndCreatesPositiveBillingPart8Cases(scope);
    registerCreatesZeroAmountTransactionWhenBillingfactorIs0AndInserPart9Cases(scope);
    registerIncludesExistingTransactionItemsInTotalAndUpdatesExistingPart10Cases(scope);
  });
}

export function registerAppliesBillingfactor100DiscountAndCreatesBillingFactorItePart6Cases(
  fixture: ReturnType<typeof registerHandleresourcesessionstartedeventScopeFixture>,
) {
  it('applies billingFactor < 100% (discount) and creates BILLING_FACTOR item', async () => {
    const usage = {
      id: 14,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-09-20T09:08:00.000Z'),
      endTime: new Date('2026-09-20T09:10:00.000Z'),
      usageInMinutes: 2,
      resource: { id: 200 },
      userId: 20,
      user: {
        id: 20,
        billingFactor: 50,
      } as User,
    } as unknown as ResourceUsage;

    jest
      .spyOn(fixture.fixture.service, 'getResourceBillingConfiguration')
      .mockResolvedValue({ creditsPerMinute: 20, creditsPerUsage: 0 } as ResourceBillingConfiguration);

    // Custom manager to capture saves/updates
    const manager = {
      findOneBy: jest.fn().mockResolvedValue(null),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest
        .fn()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation(async (entity: unknown, data: any) => {
          if (data && 'status' in data && 'amount' in data) {
            return { id: 1001, ...data };
          }
          return data;
        }),
      getRepository: jest.fn(() => ({ findOneBy: jest.fn(), create: jest.fn(), save: jest.fn() })),
    } as unknown as {
      findOneBy: jest.Mock;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findOne: jest.Mock<any, any>;
      update: jest.Mock;
      save: jest.Mock;
      getRepository: jest.Mock;
    };

    // ceil(2) = 2 -> 2 * 20 + 0 = 40 credits; billingFactor 50% -> 20
    const transaction = await fixture.fixture.service.chargeForResourceUsage(
      usage as ResourceUsage,
      manager as unknown as never,
    );

    expect(fixture.fixture.service.getResourceBillingConfiguration).toHaveBeenCalledWith(200, expect.any(Object));
    expect(transaction).toEqual(expect.objectContaining({ amount: -20 }));

    // Ensure BILLING_FACTOR item saved with the discount as a negative unit price
    expect(manager.save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ name: 'BILLING_FACTOR', unitPrice: -20, quantity: 1 }),
    );

    // Ensure base items were saved
    expect(manager.save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ name: 'PER_SESSION', unitPrice: 0, quantity: 1 }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ name: 'PER_MINUTE', unitPrice: 20, quantity: 2 }),
    );
  });
}

export function registerAppliesBillingfactor100SurchargeAndCreatesPositiveBillingPart8Cases(
  fixture: ReturnType<typeof registerHandleresourcesessionstartedeventScopeFixture>,
) {
  it('applies billingFactor > 100% (surcharge) and creates positive BILLING_FACTOR item', async () => {
    const usage = {
      id: 16,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-09-20T09:09:00.000Z'),
      endTime: new Date('2026-09-20T09:10:00.000Z'),
      usageInMinutes: 1,
      resource: { id: 202 },
      userId: 22,
      user: {
        id: 22,
        billingFactor: 150,
      } as User,
    } as unknown as ResourceUsage;

    jest
      .spyOn(fixture.fixture.service, 'getResourceBillingConfiguration')
      .mockResolvedValue({ creditsPerMinute: 20, creditsPerUsage: 0 } as ResourceBillingConfiguration);

    const manager = {
      findOneBy: jest.fn().mockResolvedValue(null),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest
        .fn()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .mockImplementation(async (entity: unknown, data: any) => {
          if (data && 'status' in data && 'amount' in data) {
            return { id: 1003, ...data };
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

    // base = 20, factor 150% -> total 30, surcharge item +10
    const transaction = await fixture.fixture.service.chargeForResourceUsage(
      usage as ResourceUsage,
      manager as unknown as never,
    );

    expect(transaction).toEqual(expect.objectContaining({ amount: -30 }));

    expect(manager.save).toHaveBeenCalledWith(
      BillingTransactionItem,
      expect.objectContaining({ name: 'BILLING_FACTOR', unitPrice: 10, quantity: 1 }),
    );
  });
}

export function registerBillsAndRecordsExactDurationDurationmsMsIndependentlyForPart1Cases(
  fixture: ReturnType<typeof registerHandleresourcesessionstartedeventScopeFixture>,
) {
  it.each([
    { durationMs: 0, roundedMinutes: 0 },
    { durationMs: 60_000, roundedMinutes: 1 },
    { durationMs: 60_001, roundedMinutes: 2 },
  ])(
    'bills and records exact duration $durationMs ms independently for both components',
    async ({ durationMs, roundedMinutes }) => {
      const startTime = new Date('2026-09-20T09:05:00Z');
      const usage = {
        id: 22,
        startTime,
        endTime: new Date(startTime.getTime() + durationMs),
        // SQLite's generated Julian-day duration can be just above an exact minute.
        usageInMinutes: durationMs === 60_000 ? 1.000000610947609 : durationMs / 60_000,
        attributedOperatingDurationInMinutes: durationMs / 60_000,
        sessionDurationCreditsPerMinute: 3,
        operatingDurationCreditsPerMinute: 7,
        creditsPerUsage: 0,
        billingFactor: 100,
        resource: { id: 205 },
        userId: 25,
      } as ResourceUsage;
      jest
        .spyOn(fixture.fixture.service, 'getResourceBillingConfiguration')
        .mockResolvedValue({ creditsPerUsage: 0, creditsPerMinute: 0 } as ResourceBillingConfiguration);
      const manager = fixture.createMockManager();
      manager.findOne.mockResolvedValue({ id: 999, items: [], status: BillingTransactionStatus.Pending });

      const transaction = await fixture.fixture.service.chargeForResourceUsage(usage, manager as never);

      expect(transaction.amount).toBe(-roundedMinutes * 10);
      expect(manager.save).toHaveBeenCalledWith(
        BillingTransactionItem,
        expect.objectContaining({
          name: 'PER_MINUTE',
          durationMs,
          quantity: roundedMinutes,
          unitPrice: 3,
        }),
      );
      expect(manager.save).toHaveBeenCalledWith(
        BillingTransactionItem,
        expect.objectContaining({
          name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE',
          durationMs,
          quantity: roundedMinutes,
          unitPrice: 7,
        }),
      );
    },
  );
}
