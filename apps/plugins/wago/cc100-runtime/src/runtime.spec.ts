import { defineWagoRuntimeTests } from './runtime.spec.defineWagoRuntimeTests.test-fixture';

describe('WagoRuntime', () => {
  defineWagoRuntimeTests();
});
export type WagoRuntimeTestScope = ReturnType<typeof defineWagoRuntimeTests>;

export { defineWagoRuntimeTests } from './runtime.spec.defineWagoRuntimeTests.test-fixture';
