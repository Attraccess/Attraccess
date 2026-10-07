import {
  ConflictException
} from '@nestjs/common';
import { VERIFIER_PREFIX } from "./wago-commissioning.service.verifier-prefix";
import { WagoCommissioningServiceReportPreparationProgressOperation } from "./wago-commissioning.service.wago-commissioning-service-report-preparation-progress-operation";
export abstract class WagoCommissioningServiceEncryptVerifierOperation extends WagoCommissioningServiceReportPreparationProgressOperation {


  protected encryptVerifier(plaintext: string): string {
    try {
      return VERIFIER_PREFIX + this.context.secrets.encrypt(plaintext);
    } catch {
      throw new ConflictException('Commissioning verifier encryption failed.');
    }
  }
}
