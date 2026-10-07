import { defineDurableManagedRuntimeReconciliationTests } from './wago-runtime-update.spec.define-durable-managed-runtime-reconciliation-tests';

export type DurableManagedRuntimeReconciliationTestScope = ReturnType<
  typeof defineDurableManagedRuntimeReconciliationTests
>;
