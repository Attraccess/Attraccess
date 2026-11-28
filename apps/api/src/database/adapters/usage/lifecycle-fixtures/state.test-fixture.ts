import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BillingTransaction,
  BillingTransactionItem,
  FormSubmission,
  ResourceOperatingInterval,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  User,
} from '@attraccess/database-entities';
import { BillingTransactionStatus, ResourceUsageAction } from '@attraccess/application-models';
import type { DataSource } from 'typeorm';
import { withoutIntegrityTriggers } from '../integrity-triggers.test-fixture';
import { ResourceUsageService } from '../../../../resources/usage/sessions/resource-usage.service';
import { ResourceOperatingIntervalService } from '../../../../resources/operating-intervals/resource-operating-interval.service';
import { ExternalEffectFailureError } from '../../../../resources/flows/errors/external-effect-failure.error';
export function createUsageLifecyclePersistenceAroundExternalFlowsFixture() {
  let source: DataSource;

  let usage: ResourceUsageService;

  let operating: ResourceOperatingIntervalService;

  let users: User[];

  let events: EventEmitter2;

  let pluginEvents: { emit: jest.Mock };

  let flow: { runFlow: jest.Mock; trackResourceActivity: jest.Mock };

  let billing: {
    getResourceBillingConfiguration: jest.Mock;
    validateResourceUsageStart: jest.Mock;
    handleResourceUsageStart: jest.Mock;
    handleResourceUsageContinuation: jest.Mock;
    chargeForResourceUsage: jest.Mock;
    notifyResourceUsageCharge: jest.Mock;
    flowsMayLowerCharge: jest.Mock;
  };

  let maintenance: { hasActiveMaintenance: jest.Mock; canManageMaintenance: jest.Mock };
  let health: { isResourceUnhealthy: jest.Mock };
  let introducers: { canMaintain: jest.Mock; isIntroducer: jest.Mock };

  const draftItem = {
    name: 'Energy',
    description: 'Pending measurement',
    externalReference: 'meter',
    unitPrice: 2,
    quantity: 3,
  };

  async function seedActiveSession() {
    const session = await source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date('2026-09-19T10:00:00.123Z'),
      startNotes: 'Original session',
      endTime: null,
      isFinalized: true,
      lifecyclePending: false,
    });
    const transaction = await source.getRepository(BillingTransaction).save({
      resourceUsageId: session.id,
      userId: 1,
      amount: 0,
      status: BillingTransactionStatus.Pending,
    });
    await source
      .getRepository(BillingTransactionItem)
      .save({ ...draftItem, billingTransactionId: transaction.id, quantity: 7 });
    return session;
  }

  async function publishedState() {
    return {
      sessions: await source.getRepository(ResourceUsage).find({ order: { id: 'ASC' } }),
      transactions: await source.getRepository(BillingTransaction).find(),
      items: await source.getRepository(BillingTransactionItem).find(),
      users: await source.getRepository(User).find(),
      submissions: await source.getRepository(FormSubmission).find(),
    };
  }

  /** Stores legacy rows (orphans, duplicate sessions) the integrity guards refuse; see `withoutIntegrityTriggers`. */
  const withoutGuards = <T>(work: () => Promise<T>) => withoutIntegrityTriggers(source, work);

  /** A BEFORE row trigger whose plpgsql `body` runs for `event` (e.g. `INSERT`, `UPDATE OF "billingFactor"`); returns its removal. */
  async function installTrigger(options: { name: string; table: string; event: string; body: string; when?: string }) {
    const { name, table, event, body, when } = options;
    await source.query(
      `CREATE FUNCTION "${name}_fn"() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN ${body} RETURN NEW; END $fn$`,
    );
    await source.query(
      `CREATE TRIGGER "${name}" BEFORE ${event} ON "${table}" FOR EACH ROW ${when ? `WHEN (${when}) ` : ''}EXECUTE FUNCTION "${name}_fn"()`,
    );
    return async () => {
      await source.query(`DROP TRIGGER "${name}" ON "${table}"`);
      await source.query(`DROP FUNCTION "${name}_fn"()`);
    };
  }

  /** Stores a legacy orphan: open, neither finalized nor pending (a state the database no longer accepts). */
  function seedLegacyOrphan(fields: Partial<ResourceUsage> = {}) {
    return withoutGuards(() =>
      source.getRepository(ResourceUsage).save({
        resourceId: 1,
        userId: 1,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date(),
        endTime: null,
        isFinalized: false,
        lifecyclePending: false,
        ...fields,
      }),
    );
  }

  function failAfterObservation() {
    flow.runFlow.mockImplementation(async (resourceId, _trigger, payload, manager, { lifecycleAttemptId }) => {
      expect(manager).toBeUndefined();
      const attempt = await source
        .getRepository(ResourceUsageLifecycleAttempt)
        .findOneByOrFail({ id: lifecycleAttemptId });
      expect(attempt.formSubmissions).toHaveLength(1);
      if (attempt.candidateUsageId !== null) {
        expect(
          await source.getRepository(ResourceUsage).findOneByOrFail({ id: attempt.candidateUsageId }),
        ).toMatchObject({ lifecyclePending: true, isFinalized: false });
        expect((await usage.getActiveSession(resourceId))?.id ?? null).toBe(attempt.previousUsageId);
      }
      await operating.transition(resourceId, 'operating', {
        flowNodeId: 'observed-operation',
        flowRunId: 'failed-flow',
      });
      await usage.stageLifecycleBillingItem(lifecycleAttemptId, resourceId, payload.id, draftItem);
      expect(
        (await source.getRepository(ResourceUsageLifecycleAttempt).findOneByOrFail({ id: lifecycleAttemptId }))
          .billingItems,
      ).toHaveLength(1);
      throw new ExternalEffectFailureError('Downstream external command failed', new Error('offline'));
    });
  }

  async function expectObservationAndNoAttempt() {
    expect(await source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(await source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(0);
    expect(await source.getRepository(ResourceOperatingInterval).find()).toEqual([
      expect.objectContaining({
        resourceId: 1,
        endTime: null,
        startFlowNodeId: 'observed-operation',
        startFlowRunId: 'failed-flow',
      }),
    ]);
    expect(billing.handleResourceUsageStart).not.toHaveBeenCalled();
    expect(billing.chargeForResourceUsage).not.toHaveBeenCalled();
    expect(billing.notifyResourceUsageCharge).not.toHaveBeenCalled();
  }

  const scope = {
    get source() {
      return source;
    },
    set source(value: typeof source) {
      source = value;
    },
    get publishedState() {
      return publishedState;
    },
    get events() {
      return events;
    },
    set events(value: typeof events) {
      events = value;
    },
    get pluginEvents() {
      return pluginEvents;
    },
    set pluginEvents(value: typeof pluginEvents) {
      pluginEvents = value;
    },
    get usage() {
      return usage;
    },
    set usage(value: typeof usage) {
      usage = value;
    },
    get users() {
      return users;
    },
    set users(value: typeof users) {
      users = value;
    },
    get flow() {
      return flow;
    },
    set flow(value: typeof flow) {
      flow = value;
    },
    get billing() {
      return billing;
    },
    set billing(value: typeof billing) {
      billing = value;
    },
    /** The database has the complete released schema; kept as an empty list for fixtures that spread it. */
    get schemas(): unknown[] {
      return [];
    },
    get withoutIntegrityTriggers() {
      return withoutGuards;
    },
    get installTrigger() {
      return installTrigger;
    },
    get seedLegacyOrphan() {
      return seedLegacyOrphan;
    },
    get seedActiveSession() {
      return seedActiveSession;
    },
    get failAfterObservation() {
      return failAfterObservation;
    },
    get expectObservationAndNoAttempt() {
      return expectObservationAndNoAttempt;
    },
    get operating() {
      return operating;
    },
    set operating(value: typeof operating) {
      operating = value;
    },
    get draftItem() {
      return draftItem;
    },
    get maintenance() {
      return maintenance;
    },
    set maintenance(value: typeof maintenance) {
      maintenance = value;
    },
    get health() {
      return health;
    },
    set health(value: typeof health) {
      health = value;
    },
    get introducers() {
      return introducers;
    },
    set introducers(value: typeof introducers) {
      introducers = value;
    },
  };
  return scope;
}
