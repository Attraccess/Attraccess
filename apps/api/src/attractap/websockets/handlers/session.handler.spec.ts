import { registerAttractapSessionHandlerSessionFlowButtonFixture } from './session.handler.attractap-session-handler-session-flow-button.test-fixture';
import { registerHandleStartResourceUsageSessionCases } from './session.handler.attractap-session-handler-session-flow-button.handle-start-resource-usage-session.test-cases';
import { registerHandleStopResourceUsageSessionCases } from './session.handler.attractap-session-handler-session-flow-button.handle-stop-resource-usage-session.test-cases';
import { registerHandleTriggerFlowButtonCases } from './session.handler.attractap-session-handler-session-flow-button.handle-trigger-flow-button.test-cases';
import { registerLiveUsageStatsCases } from './session.handler.attractap-session-handler-session-flow-button.live-usage-stats.test-cases';
describe('AttractapSessionHandler – session + flow button', () => {
  const fixture = registerAttractapSessionHandlerSessionFlowButtonFixture();
  registerHandleStartResourceUsageSessionCases(fixture);
  registerHandleStopResourceUsageSessionCases(fixture);
  registerHandleTriggerFlowButtonCases(fixture);
  registerLiveUsageStatsCases(fixture);
});
