import { BillingTransactionStatus, ProjectSwitchCharging } from '@attraccess/application-models';
import { BillingTransactionItem, ResourceUsage } from '@attraccess/database-entities';
import { InsufficientBalanceError } from '../../../billing/errors/insufficient-balance.error';
import { createBillingDatabase, type BillingConnection } from './billing-persistence.test-fixture';

type Database = Awaited<ReturnType<typeof createBillingDatabase>>;

const { CONTINUE, NEW_SESSION } = ProjectSwitchCharging;
const at = (minutes: number) => new Date(Date.parse('2026-11-13T09:00:00.000Z') + Math.round(minutes * 60_000));

/** ATT-1421: the real ledger bills the parts of a switched session, reading the chain through `previousUsageId`. */
describe('Billing a switched session', () => {
  let db: Database;
  let billing: BillingConnection;

  beforeAll(async () => {
    db = await createBillingDatabase();
    billing = await db.connect();
  }, 120_000);

  afterAll(async () => {
    await db.close();
  });

  /** Consecutive parts of one session, each settled like a switch or the final stop settles it. */
  async function billChain(name: string, boundaries: number[], modes: Array<ProjectSwitchCharging | null>) {
    const { user, resource } = await db.seed(db.primary, name);
    const parts: ResourceUsage[] = [];
    for (const [index, mode] of modes.entries()) {
      const usage = await db.seedUsage(db.primary, user.id, resource.id, {
        startTime: at(boundaries[index]),
        endTime: at(boundaries[index + 1]),
        previousUsageId: parts[index - 1]?.id ?? null,
        projectSwitchCharging: mode,
      });
      await billing.ledger.insertTransaction({
        userId: user.id,
        resourceUsageId: usage.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      });
      await billing.service.chargeForResourceUsage({
        ...usage,
        resource: { id: resource.id },
        user: { billingFactor: 100 },
      });
      parts.push(usage);
    }
    return { user, resource, parts };
  }

  const charges = async (parts: ResourceUsage[]) =>
    Promise.all(
      parts.map(async (part) => {
        const bill = await billing.ledger.findUsageTransaction(part.id);
        return bill ? -bill.amount : 0;
      }),
    );

  it('rounds a long chain on cumulative boundaries: the same total as one session of 4.4 minutes', async () => {
    // 5 per usage, 2 per started minute: one session of 4.4 minutes costs 5 + 5 x 2 = 15.
    const { user, parts } = await billChain(
      'cumulative',
      [0, 1.5, 1.7, 1.9, 4.4],
      [null, CONTINUE, CONTINUE, CONTINUE],
    );

    expect(await charges(parts)).toEqual([9, 0, 0, 6]);
    expect(await billing.ledger.getBalance(user.id)).toBe(-15);
    // A part without any charge leaves no bill, like any other session without a charge.
    expect(await billing.ledger.findUsageTransaction(parts[1].id)).toBeNull();
    const items = await db.primary.getRepository(BillingTransactionItem).find({
      where: { billingTransactionId: (await billing.ledger.findUsageTransaction(parts[3].id))?.id },
      order: { id: 'ASC' },
    });
    expect(items.map((item) => [item.name, item.unitPrice, item.quantity])).toEqual([
      ['PER_SESSION', 0, 1],
      ['PER_MINUTE', 2, 3],
    ]);
  });

  it('reads the chain only back to the latest part that was charged on its own', async () => {
    const { parts } = await billChain('anchors', [0, 1.5, 3, 4.2, 5.4], [null, NEW_SESSION, CONTINUE, CONTINUE]);

    await billing.unitOfWork.run(async (scope) => {
      const walked = await billing.ledger.findContinuedUsageParts(parts[3].id, scope);
      expect(walked.map((part) => [part.startTime, part.projectSwitchCharging])).toEqual([
        [at(4.2), CONTINUE],
        [at(3), CONTINUE],
        [at(1.5), NEW_SESSION],
      ]);
    });
  });

  it('checks the balance at a switch only when the continuation is charged like a new session', async () => {
    const { user, resource } = await db.seed(db.primary, 'balance');
    const usage = await db.seedUsage(db.primary, user.id, resource.id, { endTime: null, isFinalized: true });
    const continuation = (mode: ProjectSwitchCharging) =>
      billing.unitOfWork.run((scope) =>
        billing.service.handleResourceUsageContinuation(
          resource.id,
          { ...usage, projectSwitchCharging: mode },
          user,
          scope,
        ),
      );

    await expect(continuation(NEW_SESSION)).rejects.toBeInstanceOf(InsufficientBalanceError);
    await expect(continuation(CONTINUE)).resolves.toBeUndefined();
    expect((await billing.ledger.findUsageTransaction(usage.id))?.status).toBe(BillingTransactionStatus.Pending);
  });

  it('stores the charging setting of a resource, continuing by default', async () => {
    const { resource } = await db.seed(db.primary, 'setting');

    expect((await billing.service.getResourceBillingConfiguration(resource.id)).projectSwitchCharging).toBe(CONTINUE);
    await billing.service.updateResourceBillingConfiguration(resource.id, { projectSwitchCharging: NEW_SESSION });
    await billing.service.updateResourceBillingConfiguration(resource.id, { creditsPerMinute: 3 });

    expect(await billing.service.getResourceBillingConfiguration(resource.id)).toMatchObject({
      projectSwitchCharging: NEW_SESSION,
      creditsPerMinute: 3,
    });
  });
});
