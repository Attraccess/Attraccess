import { ResourceBillingConfiguration, ResourceUsage, ResourceUsageAction, User } from '@attraccess/database-entities';
import { HandleResourceSessionStartedEventTestScope } from './billing.service.spec';
export function registerHandleResourceSessionStartedEventDoesNotCreateBillingFactorItemWhenBillingFactorIs100(
  scope: HandleResourceSessionStartedEventTestScope,
): void {
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
      .spyOn(scope.service, 'getResourceBillingConfiguration')
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
    const transaction = await scope.service.chargeForResourceUsage(usage as ResourceUsage, manager as unknown as never);
    expect(transaction.amount).toBe(-35);

    const saves = (manager.save as jest.Mock).mock.calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map(([, data]: any[]) => data);
    const hasBillingFactor = saves.some((c) => c && c.name === 'BILLING_FACTOR');
    expect(hasBillingFactor).toBe(false);
  });
}
