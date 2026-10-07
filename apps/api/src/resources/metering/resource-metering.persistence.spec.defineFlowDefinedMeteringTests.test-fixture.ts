import {
  BillingTransaction,
  BillingTransactionItem,
  ResourceFlowEdge,
  ResourceFlowNode,
} from '@attraccess/database-entities';
import { rm } from 'node:fs/promises';
import { closeResourceTransactionConnection } from '../../database/run-serialized-transaction';
import { resetTestFixture } from './resource-metering.persistence.setup.test-fixture';
import { T } from './resource-metering.persistence.spec.t';
import { createFlowDefinedMeteringFixture } from './resource-metering.persistence.spec.createFlowDefinedMeteringFixture.test-fixture';
import { defineGenericMetersTests } from './resource-metering.persistence.spec.defineGenericMetersTests.test-fixture';
import { defineUsageLifecycleTests } from './resource-metering.persistence.spec.defineUsageLifecycleTests.test-fixture';
import { defineOperationsTests } from './resource-metering.persistence.spec.defineOperationsTests.test-fixture';
import { defineMeterDefinitionTests } from './resource-metering.persistence.spec.defineMeterDefinitionTests.test-fixture';

export function defineFlowDefinedMeteringTests() {
  async function seedMeter(startData: object = {}, collectData: object = { finalRetryDelaySeconds: 0 }) {
    const nodes = scope.source.getRepository(ResourceFlowNode);
    await nodes.save([
      { id: 'start', type: T.INPUT_METERING_START, resourceId: 1, data: { meterId: 1, ...startData } },
      { id: 'ready', type: T.OUTPUT_METERING_READY, resourceId: 1, data: { meterId: 1 } },
      { id: 'collect', type: T.INPUT_METERING_COLLECT, resourceId: 1, data: { meterId: 1, ...collectData } },
      {
        id: 'report',
        type: T.OUTPUT_METERING_REPORT,
        resourceId: 1,
        data: { meterId: 1, value: '1' },
      },
    ]);
    await scope.source.getRepository(ResourceFlowEdge).save([
      { id: 'e1', source: 'start', sourceHandle: 'output', target: 'ready', targetHandle: 'input', resourceId: 1 },
      { id: 'e2', source: 'collect', sourceHandle: 'output', target: 'report', targetHandle: 'input', resourceId: 1 },
    ]);
  }

  async function items(usageId: number) {
    const transaction = await scope.source
      .getRepository(BillingTransaction)
      .findOneByOrFail({ resourceUsageId: usageId });
    return {
      transaction,
      items: await scope.source
        .getRepository(BillingTransactionItem)
        .find({ where: { billingTransactionId: transaction.id } }),
    };
  }
  const scope = Object.assign(createFlowDefinedMeteringFixture(), { seedMeter, items });
  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  afterEach(async () => {
    scope.usage?.onModuleDestroy();
    if (scope.source) {
      await closeResourceTransactionConnection(scope.source);
      if (scope.source.isInitialized) await scope.source.destroy();
    }
    if (scope.directory) await rm(scope.directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  describe('meter definition', () => {
    defineMeterDefinitionTests(scope);
  });

  describe('usage lifecycle', () => {
    defineUsageLifecycleTests(scope);
  });

  describe('operations', () => {
    defineOperationsTests(scope);
  });
  describe('generic meters', () => {
    defineGenericMetersTests(scope);
  });

  return scope;
}
