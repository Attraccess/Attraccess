import { defineFlowDefinedMeteringTests } from './resource-metering.persistence.spec.defineFlowDefinedMeteringTests.test-fixture';
import { defineGenericMetersTests } from './resource-metering.persistence.spec.defineGenericMetersTests.test-fixture';
import { defineUsageLifecycleTests } from './resource-metering.persistence.spec.defineUsageLifecycleTests.test-fixture';
import { defineReconciliationTests } from './resource-metering.persistence.spec.defineReconciliationTests.test-fixture';
import { defineTakeoverTests } from './resource-metering.persistence.spec.defineTakeoverTests.test-fixture';
import { defineOperationsTests } from './resource-metering.persistence.spec.defineOperationsTests.test-fixture';
import { defineMeterDefinitionTests } from './resource-metering.persistence.spec.defineMeterDefinitionTests.test-fixture';

// This SQLite suite runs multiple settlements per case; coverage on CI exceeds Jest's five-second default.
jest.setTimeout(30_000);

describe('Flow-defined metering', () => {
  defineFlowDefinedMeteringTests();
});
export type FlowDefinedMeteringTestScope = ReturnType<typeof defineFlowDefinedMeteringTests>;
export type GenericMetersTestScope = ReturnType<typeof defineGenericMetersTests>;
export type UsageLifecycleTestScope = ReturnType<typeof defineUsageLifecycleTests>;
export type ReconciliationTestScope = ReturnType<typeof defineReconciliationTests>;
export type TakeoverTestScope = ReturnType<typeof defineTakeoverTests>;
export type OperationsTestScope = ReturnType<typeof defineOperationsTests>;
export type MeterDefinitionTestScope = ReturnType<typeof defineMeterDefinitionTests>;

export { Handler } from './resource-metering.persistence.spec.handler';
export { defineFlowDefinedMeteringTests } from './resource-metering.persistence.spec.defineFlowDefinedMeteringTests.test-fixture';
export { defineGenericMetersTests } from './resource-metering.persistence.spec.defineGenericMetersTests.test-fixture';
export { defineUsageLifecycleTests } from './resource-metering.persistence.spec.defineUsageLifecycleTests.test-fixture';
export { defineReconciliationTests } from './resource-metering.persistence.spec.defineReconciliationTests.test-fixture';
export { defineTakeoverTests } from './resource-metering.persistence.spec.defineTakeoverTests.test-fixture';
export { defineOperationsTests } from './resource-metering.persistence.spec.defineOperationsTests.test-fixture';
export { defineMeterDefinitionTests } from './resource-metering.persistence.spec.defineMeterDefinitionTests.test-fixture';
