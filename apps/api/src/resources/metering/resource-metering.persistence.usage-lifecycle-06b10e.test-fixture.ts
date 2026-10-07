import { registerFlowDefinedEnergyMeteringFixture } from './resource-metering.persistence.flow-defined-energy-metering.test-fixture';

export function registerUsageLifecycleScopeFixture(
  fixture: ReturnType<typeof registerFlowDefinedEnergyMeteringFixture>,
) {
  async function start(user = fixture.users[0], dto: { forceTakeOver?: boolean } = {}) {
    return fixture.usage.startSession(1, user, dto as never);
  }

  const end = (user = fixture.users[0]) => fixture.usage.endSession(1, user, {} as never);
  return {
    get fixture() {
      return fixture;
    },
    get start() {
      return start;
    },
    get end() {
      return end;
    },
  };
}
