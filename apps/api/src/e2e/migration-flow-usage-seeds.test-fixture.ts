import {
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  Project,
  Resource,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceFlowVariable,
  ResourceFlowVariableScope,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceMeter,
  ResourceMeteringSessionStatus,
  ResourceUsage,
  ResourceUsageAction,
  ResourceUsageLifecycleAttempt,
  User,
} from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { ensureEntity } from './migration-seed-storage.test-fixture';
export async function migrationFlowUsageSeeds(
  dataSource: DataSource,
  seedTag: string,
  primaryUser: User,
  secondaryUser: User,
  resource: Resource,
  project: Project,
) {
  const flowNodeRepo = dataSource.getRepository(ResourceFlowNode);

  const flowEdgeRepo = dataSource.getRepository(ResourceFlowEdge);

  const flowVariableRepo = dataSource.getRepository(ResourceFlowVariable);

  const usageRepo = dataSource.getRepository(ResourceUsage);

  const billingTransactionRepo = dataSource.getRepository(BillingTransaction);

  const billingItemRepo = dataSource.getRepository(BillingTransactionItem);

  const lifecycleAttemptRepo = dataSource.getRepository(ResourceUsageLifecycleAttempt);

  const flowNode = await ensureEntity(flowNodeRepo, () => ({
    id: `seed-node-${seedTag}`,
    type: ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
    position: { x: 10, y: 10 },
    data: {},
    resourceId: resource.id,
  }));

  await ensureEntity(flowEdgeRepo, () => ({
    id: `seed-edge-${seedTag}`,
    source: flowNode.id,
    target: flowNode.id,
    sourceHandle: null,
    targetHandle: null,
    resourceId: flowNode.resourceId,
  }));

  await ensureEntity(flowVariableRepo, () => ({
    scope: ResourceFlowVariableScope.RESOURCE,
    resourceId: resource.id,
    key: `seed-var-${seedTag}`,
    value: '"seed"',
    valueType: 'string' as const,
  }));

  const usage = await ensureEntity(usageRepo, () => ({
    usageAction: ResourceUsageAction.Usage,
    resourceId: resource.id,
    userId: primaryUser.id,
    projectId: project.id,
    startNotes: 'Seed usage',
    endNotes: null,
    isFinalized: true,
    lifecyclePending: false,
    creditsPerUsage: 5,
    billingFactor: 50,
  }));

  if (!(await lifecycleAttemptRepo.existsBy({ resourceId: resource.id }))) {
    // An interrupted takeover owns only a hidden candidate; the existing usage and bill stay intact.
    const candidate = await usageRepo.save(
      usageRepo.create({
        usageAction: ResourceUsageAction.Usage,
        resourceId: resource.id,
        userId: secondaryUser.id,
        projectId: project.id,
        startTime: new Date(),
        startNotes: 'Seed interrupted takeover',
        isFinalized: false,
        lifecyclePending: true,
      }),
    );
    await lifecycleAttemptRepo.save(
      lifecycleAttemptRepo.create({
        id: `seed-lifecycle-attempt-${seedTag}`,
        resourceId: resource.id,
        kind: 'takeover',
        candidateUsageId: candidate.id,
        previousUsageId: usage.id,
        transitionTime: candidate.startTime,
        formSubmissions: [],
        billingItems: [],
      }),
    );
  }

  const meter = await ensureEntity(dataSource.getRepository(ResourceMeter), () => ({
    resourceId: resource.id,
    name: 'Energy (kWh)',
    creditsPerUnit: 30,
    lifetimeValue: '500000000',
    counterValue: '1500000000',
  }));
  const meteringSession = await ensureEntity(dataSource.getRepository(ResourceMeteringSession), () => ({
    id: `seed-metering-session-${seedTag}`,
    resourceId: resource.id,
    usageId: usage.id,
    meterId: meter.id,
    meterName: meter.name,
    status: ResourceMeteringSessionStatus.Active,
    creditsPerUnit: 30,
    baselineValue: '1000000000',
    latestValue: '500000000',
    latestObservedAt: new Date(),
  }));

  await ensureEntity(dataSource.getRepository(ResourceMeteringOperation), () => ({
    id: `seed-metering-operation-${seedTag}`,
    sessionId: meteringSession.id,
    meterId: meter.id,
    resourceId: resource.id,
    kind: 'interim' as const,
    status: 'completed' as const,
    requestedAt: new Date(),
    completedAt: new Date(),
    totalValue: '500000000',
    observedAt: new Date(),
  }));

  const billingTransaction = await ensureEntity(billingTransactionRepo, () => ({
    userId: primaryUser.id,
    amount: 100,
    status: BillingTransactionStatus.Completed,
    initiatorId: secondaryUser.id,
    resourceUsageId: usage.id,
    externalReference: `seed-transaction-${seedTag}`,
  }));

  await ensureEntity(billingItemRepo, () => ({
    billingTransactionId: billingTransaction.id,
    name: 'Seed Item',
    description: 'Seed billing item',
    unitPrice: 100,
    quantity: 1,
    durationMs: 60_000,
  }));
  return { usage };
}
