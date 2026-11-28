import { BillingTransactionStatus, ProjectSwitchCharging } from '@attraccess/application-models';
import { applyPartBillingFactor } from '@attraccess/shared';
import { firstValueFrom } from 'rxjs';
import { BillingTransaction, BillingTransactionItem, ResourceUsage } from '@attraccess/database-entities';
import { InsufficientBalanceError } from '../../../billing/errors/insufficient-balance.error';
import type { LiveNotificationsService } from '../../../billing/live-notifications/live-notifications.service';
import { createBillingDatabase, type BillingConnection } from './billing-persistence.test-fixture';

type Database = Awaited<ReturnType<typeof createBillingDatabase>>;

const { CONTINUE, CONTINUE_PER_PART_ROUNDING, NEW_SESSION } = ProjectSwitchCharging;
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
      // Each with what its bill charged before the billing factor: 5 per use and 2 per minute rounded together.
      expect(walked.map((part) => [part.startTime, part.projectSwitchCharging, part.grossCredits])).toEqual([
        [at(4.2), CONTINUE, BigInt(2)],
        [at(3), CONTINUE, BigInt(2)],
        [at(1.5), NEW_SESSION, BigInt(9)],
      ]);
    });
  });

  it.each<[string, ProjectSwitchCharging[]]>([
    ['continue', [CONTINUE, CONTINUE]],
    ['per-part', [CONTINUE_PER_PART_ROUNDING, CONTINUE_PER_PART_ROUNDING]],
    ['new-session', [NEW_SESSION, NEW_SESSION]],
    ['changed to continue after a new session', [NEW_SESSION, CONTINUE]],
    ['changed to continue after per-part rounding', [CONTINUE_PER_PART_ROUNDING, CONTINUE]],
    ['changed to new-session after continue', [CONTINUE, NEW_SESSION]],
  ])('tells what the running part will be billed with (%s)', async (name, modes) => {
    const { user, resource, parts } = await billChain(`running ${name}`, [0, 1.5, 3.2], [null, modes[0]]);
    const startTime = at(3.2);
    const running = await db.seedUsage(db.primary, user.id, resource.id, {
      startTime,
      endTime: null,
      isFinalized: true,
      previousUsageId: parts[1].id,
      projectSwitchCharging: modes[1],
      creditsPerUsage: 999,
      sessionDurationCreditsPerMinute: 199,
      billingFactor: 33,
    });

    const billingOfPart = await billing.service.getRunningPartBilling(running.id);
    expect(billingOfPart?.userId).toBe(user.id);

    // The estimate the web makes from those figures, for an end 2.3 minutes later ...
    const endTime = at(5.5);
    const { flatCredits, priorCredits, roundingStartTime } = billingOfPart as NonNullable<typeof billingOfPart>;
    const started = (time: Date) => Math.ceil((time.getTime() - roundingStartTime.getTime()) / 60_000);
    const gross = BigInt(flatCredits + 199 * (started(endTime) - started(startTime)));
    const estimate = applyPartBillingFactor(BigInt(priorCredits), gross, 33).amount;

    // ... is the bill of that part.
    await db.primary.getRepository(ResourceUsage).update(running.id, { endTime });
    await billing.service.chargeForResourceUsage({
      ...running,
      endTime,
      resource: { id: resource.id },
      user: { billingFactor: 100 },
    });
    expect(await charges([running])).toEqual([estimate]);
    await expect(billing.service.getRunningPartBilling(running.id)).resolves.toBeNull();
  });

  interface FactorPart {
    /** The part ends this many minutes after the session started. */
    end: number;
    /** Attributed operating minutes, fractions allowed. */
    operating: number;
    /** A meter or flow item on the part's bill. */
    items: number;
  }

  /** Bills the parts of one `continue` session at 5 per use, 2 per minute and 7 per operating minute. */
  async function billWithFactor(name: string, factor: number, chain: FactorPart[]) {
    const { user, resource } = await db.seed(db.primary, name);
    const parts: ResourceUsage[] = [];
    for (const [index, part] of chain.entries()) {
      const usage = await db.seedUsage(db.primary, user.id, resource.id, {
        startTime: at(index ? chain[index - 1].end : 0),
        endTime: at(part.end),
        previousUsageId: parts[index - 1]?.id ?? null,
        projectSwitchCharging: index ? CONTINUE : null,
        operatingDurationCreditsPerMinute: 7,
        attributedOperatingDurationInMinutes: part.operating,
        billingFactor: factor,
      });
      const pending = await billing.ledger.insertTransaction({
        userId: user.id,
        resourceUsageId: usage.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      });
      if (part.items)
        await db.primary.getRepository(BillingTransactionItem).save({
          billingTransactionId: pending.id,
          name: 'Energy',
          unitPrice: part.items,
          quantity: 1,
          meterQuantity: '1',
          meterCreditsPerUnit: part.items,
        });
      await billing.service.chargeForResourceUsage({
        ...usage,
        resource: { id: resource.id },
        user: { billingFactor: 100 },
      });
      parts.push(usage);
    }
    return charges(parts);
  }

  it.each([33, 50])(
    'bills fractional operating minutes and items at a factor of %i %% exactly like one unsplit session',
    async (factor) => {
      const chain: FactorPart[] = [
        { end: 0.7, operating: 0.46, items: 3 },
        { end: 1.9, operating: 0.33, items: 0 },
        { end: 2.3, operating: 0.21, items: 1 },
        { end: 4.05, operating: 1.37, items: 0 },
      ];
      const split = await billWithFactor(`factor ${factor}`, factor, chain);
      const [whole] = await billWithFactor(`factor ${factor} unsplit`, factor, [
        { end: 4.05, operating: 0.46 + 0.33 + 0.21 + 1.37, items: 4 },
      ]);

      // Unsplit: 5 + 5 minutes x 2 + 3 operating minutes x 7 + 4 = 40 before the factor.
      expect(whole).toBe(factor === 33 ? 13 : 20);
      expect(split.reduce((sum, charge) => sum + charge, 0)).toBe(whole);
    },
  );

  it('sums the charges and meter corrections of all parts up to the one asked about', async () => {
    const { user, resource, parts } = await billChain('totals', [0, 1.5, 1.7, 4.4], [null, CONTINUE, CONTINUE]);
    const own = await billing.ledger.findUsageTransaction(parts[0].id);
    const correction = {
      userId: user.id,
      amount: -7,
      status: BillingTransactionStatus.Completed,
      correctionOfId: own?.id,
    };
    await db.primary.getRepository(BillingTransaction).save(correction);

    // 5 + 2 x 2 minutes for the first part, nothing for the second, 2 x 3 minutes for the third, 7 corrected.
    await expect(billing.service.getSwitchedSessionCharge(parts[0].id, user.id)).resolves.toEqual({
      continues: true,
      sessionAmount: -16,
      resourceName: resource.name,
    });
    await expect(billing.service.getSwitchedSessionCharge(parts[2].id, user.id)).resolves.toEqual({
      continues: false,
      sessionAmount: -22,
      resourceName: resource.name,
    });
    // Somebody else has no charge in it.
    await expect(billing.service.getSwitchedSessionCharge(parts[2].id, user.id + 1000)).resolves.toMatchObject({
      sessionAmount: 0,
    });
  });

  it('knows nothing special about a session that was never switched', async () => {
    const { user, parts } = await billChain('unswitched', [0, 1.5], [null]);

    await expect(billing.service.getSwitchedSessionCharge(parts[0].id, user.id)).resolves.toBeNull();
    await expect(billing.service.getSwitchedSessionCharge(999_999, user.id)).resolves.toBeNull();
  });

  it('says on every live event of a switched session what it is about, also when the last part is free', async () => {
    const events: Array<Record<string, unknown>> = [];
    const live = (billing.service as unknown as { liveNotificationsService: LiveNotificationsService })
      .liveNotificationsService;
    const { user, resource } = await db.seed(db.primary, 'events');
    const subscription = live.getTransactionSubject(user.id).subscribe(({ data }) => events.push({ ...data }));
    const bill = async (usage: ResourceUsage) => {
      await billing.ledger.insertTransaction({
        userId: user.id,
        resourceUsageId: usage.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      });
      const published = firstValueFrom(live.getTransactionSubject(user.id));
      await billing.service.chargeForResourceUsage({
        ...usage,
        resource: { id: resource.id },
        user: { billingFactor: 100 },
      });
      // The event is published once the charge committed.
      await published;
    };

    const first = await db.seedUsage(db.primary, user.id, resource.id, { startTime: at(0), endTime: at(1.5) });
    const last = await db.seedUsage(db.primary, user.id, resource.id, {
      startTime: at(1.5),
      endTime: null,
      isFinalized: true,
      previousUsageId: first.id,
      projectSwitchCharging: CONTINUE,
    });
    await bill(first);
    // Ends within the minute the first part already paid for: no charge of its own.
    await db.primary.getRepository(ResourceUsage).update(last.id, { endTime: at(1.7) });
    await bill({ ...last, endTime: at(1.7) } as ResourceUsage);
    subscription.unsubscribe();

    expect(events).toEqual([
      expect.objectContaining({
        resourceUsageId: first.id,
        amount: -9,
        status: BillingTransactionStatus.Completed,
        switchedSession: { continues: true, sessionAmount: -9, resourceName: resource.name },
      }),
      // The removed pending bill of the last part.
      expect.objectContaining({
        resourceUsageId: last.id,
        status: BillingTransactionStatus.Pending,
        switchedSession: { continues: false, sessionAmount: -9, resourceName: resource.name },
      }),
    ]);
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
