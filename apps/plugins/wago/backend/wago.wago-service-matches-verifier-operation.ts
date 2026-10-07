import { WagoController } from './wago-controller.entity';
import { hash } from './wago.helpers';
import { safeEqual } from './wago.helpers';
import { WagoServiceAppliedRevisionOperation } from './wago.wago-service-applied-revision-operation';


export abstract class WagoServiceMatchesVerifierOperation extends WagoServiceAppliedRevisionOperation {
  protected matchesVerifier(controller: WagoController, verifier: string): boolean {
    const value = verifier.trim();
    return (
      (Boolean(value) && Boolean(controller.fingerprint) && safeEqual(hash(value), hash(controller.fingerprint))) ||
      safeEqual(hash(value), controller.pairingCodeHash)
    );
  }
}
