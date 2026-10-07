import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  FormSubmission,
  ResourceOperatingInterval,
  ResourceUsage,
  ResourceUsageAction,
  ResourceUsageLifecycleAttempt,
  User,
} from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { ResourceUsageService } from './resourceUsage.service';
import { ResourceOperatingIntervalService } from '../operating-intervals/resource-operating-interval.service';
import { ExternalEffectFailureError } from '../flows/errors/external-effect-failure.error';
import { ResourceUsageIntegrity1790100000000 } from '../../database/migrations/1790100000000-resource-usage-integrity';
import { schemas } from './resource-usage-lifecycle.persistence.spec.schemas';
export function createUsageLifecyclePersistenceAroundExternalFlowsFixture() {
  let directory: string;

  let source: DataSource;

  let usage: ResourceUsageService;

  let operating: ResourceOperatingIntervalService;

  let users: User[];

  let events: EventEmitter2;

  let flow: { runFlow: jest.Mock; trackResourceActivity: jest.Mock };

  let billing: {
    getResourceBillingConfiguration: jest.Mock;
    validateResourceUsageStart: jest.Mock;
    handleResourceUsageStart: jest.Mock;
    chargeForResourceUsage: jest.Mock;
    notifyResourceUsageCharge: jest.Mock;
  };

  let maintenance: { hasActiveMaintenance: jest.Mock; canManageMaintenance: jest.Mock };

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

  async function migrateIntegrity() {
    const runner = source.createQueryRunner();
    try {
      await runner.startTransaction();
      await new ResourceUsageIntegrity1790100000000().up(runner);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
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
    get migrateIntegrity() {
      return migrateIntegrity;
    },
    get seedActiveSession() {
      return seedActiveSession;
    },
    get schemas() {
      return schemas;
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
    get directory() {
      return directory;
    },
    set directory(value: typeof directory) {
      directory = value;
    },
  };
  return scope;
}
