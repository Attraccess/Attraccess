import { registerResourceFlowsExecutorServiceRunFlowFixture } from './resource-flows-executor.service.resource-flows-executor-service-run-flow.test-fixture';
jest.mock('axios');
export function registerHealthNodesScopeFixture(
  fixture: ReturnType<typeof registerResourceFlowsExecutorServiceRunFlowFixture>,
) {
  return {
    get fixture() {
      return fixture;
    },
  };
}
