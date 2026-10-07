import {
  ConflictException
} from '@nestjs/common';
import { WagoCommissioningServiceLoadDeliverableSessionOperation } from "./wago-commissioning.service.wago-commissioning-service-load-deliverable-session-operation";
export abstract class WagoCommissioningServiceRequireRuntimeArtifactOperation extends WagoCommissioningServiceLoadDeliverableSessionOperation {


  protected async requireRuntimeArtifact(): Promise<void> {
    if (!(await this.artifacts?.has()))
      throw new ConflictException('Build and install the bundled CC100 runtime before installation.');
  }
}
