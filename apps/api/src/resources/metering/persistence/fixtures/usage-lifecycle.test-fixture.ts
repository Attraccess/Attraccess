import { inheritTestScope } from '../../../../test-utils/inherit-test-scope';
import { FlowDefinedMeteringTestScope } from '../flow-defined-meters.spec';

export function createUsageLifecycleFixture(parentScope: FlowDefinedMeteringTestScope) {
  async function start(user = parentScope.users[0], dto: { forceTakeOver?: boolean } = {}) {
    return parentScope.usage.startSession(1, user, dto as never);
  }

  const end = (user = parentScope.users[0]) => parentScope.usage.endSession(1, user, {} as never);

  const scope = inheritTestScope(
    {
      get seedMeter() {
        return parentScope.seedMeter;
      },
      get start() {
        return start;
      },
      get onCollect() {
        return parentScope.onCollect;
      },
      set onCollect(value: typeof parentScope.onCollect) {
        parentScope.onCollect = value;
      },
      get reading() {
        return parentScope.reading;
      },
      get end() {
        return end;
      },
      get items() {
        return parentScope.items;
      },
      get sessionOf() {
        return parentScope.sessionOf;
      },
      get log() {
        return parentScope.log;
      },
      set log(value: typeof parentScope.log) {
        parentScope.log = value;
      },
      get T() {
        return parentScope.T;
      },
      get source() {
        return parentScope.source;
      },
      set source(value: typeof parentScope.source) {
        parentScope.source = value;
      },
      get onStart() {
        return parentScope.onStart;
      },
      set onStart(value: typeof parentScope.onStart) {
        parentScope.onStart = value;
      },
      get startEffects() {
        return parentScope.startEffects;
      },
      set startEffects(value: typeof parentScope.startEffects) {
        parentScope.startEffects = value;
      },
      get usage() {
        return parentScope.usage;
      },
      set usage(value: typeof parentScope.usage) {
        parentScope.usage = value;
      },
      get metering() {
        return parentScope.metering;
      },
      set metering(value: typeof parentScope.metering) {
        parentScope.metering = value;
      },
    },
    parentScope,
  );
  return scope;
}
