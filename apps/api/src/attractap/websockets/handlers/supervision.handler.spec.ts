import { registerAttractapSupervisionHandlerFixture } from './supervision.handler.attractap-supervision-handler.test-fixture';
import { registerArmReaderCases } from './supervision.handler.attractap-supervision-handler.arm-reader.test-cases';
import { registerHandleSupervisionRequestCases } from './supervision.handler.attractap-supervision-handler.handle-supervision-request.behaviors.test-cases';
import { registerHandleSupervisorCardAuthConfirmedCases } from './supervision.handler.attractap-supervision-handler.handle-supervision-request.behaviors.test-cases';
import { registerHandleSupervisorCardAuthRequestCases } from './supervision.handler.attractap-supervision-handler.handle-supervision-request.behaviors.test-cases';
describe('AttractapSupervisionHandler', () => {
  const fixture = registerAttractapSupervisionHandlerFixture();
  registerArmReaderCases(fixture);
  registerHandleSupervisionRequestCases(fixture);
  registerHandleSupervisorCardAuthConfirmedCases(fixture);
  registerHandleSupervisorCardAuthRequestCases(fixture);
});
