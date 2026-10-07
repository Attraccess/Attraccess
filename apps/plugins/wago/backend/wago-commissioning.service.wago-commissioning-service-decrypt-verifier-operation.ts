import {
  ConflictException
} from '@nestjs/common';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { VERIFIER_PREFIX } from "./wago-commissioning.service.verifier-prefix";
import { WagoCommissioningServiceEncryptVerifierOperation } from "./wago-commissioning.service.wago-commissioning-service-encrypt-verifier-operation";
export abstract class WagoCommissioningServiceDecryptVerifierOperation extends WagoCommissioningServiceEncryptVerifierOperation {


  protected decryptVerifier(session: WagoCommissioningSession): string {
    try {
      if (!session.pairingCode?.startsWith(VERIFIER_PREFIX)) throw new Error();
      const plaintext = this.context.secrets.decrypt(session.pairingCode.slice(VERIFIER_PREFIX.length));
      if (!/^[A-Za-z0-9_-]{43}$/.test(plaintext)) throw new Error();
      return plaintext;
    } catch {
      throw new ConflictException('Commissioning verifier is unavailable; create a new session.');
    }
  }
}
