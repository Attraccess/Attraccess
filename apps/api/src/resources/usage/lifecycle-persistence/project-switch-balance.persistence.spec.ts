import {
  BillingTransaction,
  Project,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  User,
} from '@attraccess/database-entities';
import {
  ProjectChangeMode,
  BillingTransactionStatus,
  ProjectSwitchCharging,
  ResourceFlowNodeType,
} from '@attraccess/application-models';
import { InsufficientBalanceError } from '../../../billing/errors/insufficient-balance.error';
import {
  closeLifecycleFixture,
  resetTestFixture,
} from '../../../database/adapters/usage/lifecycle-fixtures/setup.test-fixture';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from '../../../database/adapters/usage/lifecycle-fixtures/state.test-fixture';
import { unitOfWorkFor } from '../../../database/adapters/shared-unit-of-work';
import type { TransactionScope } from '../../../database/unit-of-work';

jest.setTimeout(60_000);

/**
 * ATT-1421: a switch that starts a new session needs the balance for it after the old part is charged. A refusal that
 * is certain beforehand must not come after the switch flow has told devices about the switch.
 */
describe('Switching to a new session the balance has to pay for', () => {
  const scope = createUsageLifecyclePersistenceAroundExternalFlowsFixture();
  /** What the stand-in billing charges for the old part, and what it asks for to start a new session. */
  const OLD_PART = 23;
  const NEW_SESSION_NEEDS = 7;

  const switchOwn = () =>
    scope.usage.switchSessionProject(1, scope.users[0], { mode: ProjectChangeMode.SPLIT, projectId: 2 });
  const switchFlowRuns = () =>
    scope.flow.runFlow.mock.calls.filter(
      (call) => call[1] === ResourceFlowNodeType.INPUT_RESOURCE_USAGE_PROJECT_SWITCHED,
    ).length;

  /** A running session of the owner, whose balance then is `balance`. */
  const arrange = async (balance: number) => {
    await scope.source.getRepository(BillingTransaction).save({
      userId: 1,
      amount: balance,
      status: BillingTransactionStatus.Completed,
    });
    const started = await scope.usage.startSession(1, scope.users[0], { projectId: 1 });
    scope.flow.runFlow.mockClear();
    return started;
  };

  const expectUnchanged = async (startedId: number, balance: number) => {
    expect(await scope.source.getRepository(ResourceUsage).find()).toEqual([
      expect.objectContaining({ id: startedId, projectId: 1, endTime: null }),
    ]);
    expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(await scope.source.getRepository(BillingTransaction).findBy({ resourceUsageId: startedId })).toEqual([
      expect.objectContaining({ status: BillingTransactionStatus.Pending, amount: 0 }),
    ]);
    expect((await scope.source.getRepository(User).findOneByOrFail({ id: 1 })).creditBalance).toBe(balance);
  };

  beforeEach(async () => {
    await resetTestFixture(scope);
    await scope.source.getRepository(Project).save([
      { id: 1, name: 'Old project', owner: scope.users[0] },
      { id: 2, name: 'New project', owner: scope.users[0] },
    ]);
    scope.billing.getResourceBillingConfiguration.mockResolvedValue({
      creditsPerUsage: 5,
      creditsPerMinute: 2,
      creditsPerOperatingMinute: 0,
      projectSwitchCharging: ProjectSwitchCharging.NEW_SESSION,
    });
    const check = async (userId: number, transaction: TransactionScope) => {
      const manager = unitOfWorkFor(scope.source).handleOf(transaction);
      const { creditBalance } = await manager.findOneByOrFail(User, { id: userId });
      if (creditBalance < NEW_SESSION_NEEDS) throw new InsufficientBalanceError();
    };
    scope.billing.validateResourceUsageStart.mockImplementation(
      async (_resourceId: number, _usage: unknown, user: User, transaction: TransactionScope) =>
        check(user.id, transaction),
    );
    const open = scope.billing.handleResourceUsageContinuation.getMockImplementation() as (
      ...args: unknown[]
    ) => Promise<unknown>;
    scope.billing.handleResourceUsageContinuation.mockImplementation(
      async (resourceId: number, usage: unknown, user: User, transaction: TransactionScope) => {
        await check(user.id, transaction);
        return open(resourceId, usage, user, transaction);
      },
    );
  });

  afterEach(async () => {
    await closeLifecycleFixture(scope);
    jest.restoreAllMocks();
  });

  it.each([NEW_SESSION_NEEDS, OLD_PART + NEW_SESSION_NEEDS - 1])(
    'refuses a balance of %i, which the old part’s charge leaves too low, before the switch flow runs',
    async (balance) => {
      const started = await arrange(balance);

      await expect(switchOwn()).rejects.toBeInstanceOf(InsufficientBalanceError);

      expect(switchFlowRuns()).toBe(0);
      expect(scope.billing.notifyResourceUsageCharge).not.toHaveBeenCalled();
      await expectUnchanged(started.id, balance);
    },
  );

  it('switches with a balance that pays the old part and the new session, charging the old part once', async () => {
    await arrange(OLD_PART + NEW_SESSION_NEEDS);

    const continuation = await switchOwn();

    expect(continuation.projectId).toBe(2);
    expect(switchFlowRuns()).toBe(1);
    expect((await scope.source.getRepository(User).findOneByOrFail({ id: 1 })).creditBalance).toBe(NEW_SESSION_NEEDS);
    expect(await scope.source.getRepository(BillingTransaction).findBy({ resourceUsageId: continuation.id })).toEqual([
      expect.objectContaining({ status: BillingTransactionStatus.Pending }),
    ]);
  });

  it('leaves the refusal to the commit when a flow may still lower the old part’s charge', async () => {
    const started = await arrange(NEW_SESSION_NEEDS);
    scope.billing.flowsMayLowerCharge.mockResolvedValue(true);

    await expect(switchOwn()).rejects.toBeInstanceOf(InsufficientBalanceError);

    expect(switchFlowRuns()).toBe(1);
    await expectUnchanged(started.id, NEW_SESSION_NEEDS);
  });

  it('still refuses at the commit what was spent while the switch flow ran', async () => {
    const started = await arrange(OLD_PART + NEW_SESSION_NEEDS);
    scope.flow.runFlow.mockImplementationOnce(async () => {
      await scope.source.getRepository(BillingTransaction).save({
        userId: 1,
        amount: -1,
        status: BillingTransactionStatus.Completed,
      });
    });

    await expect(switchOwn()).rejects.toBeInstanceOf(InsufficientBalanceError);

    await expectUnchanged(started.id, OLD_PART + NEW_SESSION_NEEDS - 1);
  });
});
