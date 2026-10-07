import { WagoController } from './wago-controller.entity';
export type WagoControllerSummary = Omit<WagoController, 'fingerprint' | 'pairingCodeHash'> & {
  connectivity: 'online' | 'stale' | 'untrusted' | 'runtime_check' | 'runtime_update';
};
