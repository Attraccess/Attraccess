import { registerAttractapFirmwareHandlerFixture } from './firmware.handler.attractap-firmware-handler.test-fixture';
import { registerHandleFirmwareChunkRequestCases } from './firmware.handler.attractap-firmware-handler.handle-firmware-chunk-request.test-cases';
import { registerHandleFirmwareInfoCases } from './firmware.handler.attractap-firmware-handler.handle-firmware-info.test-cases';
describe('AttractapFirmwareHandler', () => {
  const fixture = registerAttractapFirmwareHandlerFixture();
  registerHandleFirmwareChunkRequestCases(fixture);
  registerHandleFirmwareInfoCases(fixture);
});
