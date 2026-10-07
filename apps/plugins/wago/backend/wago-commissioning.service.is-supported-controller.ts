import { isCc100Fw31Identity } from './wago-firmware-identity';

export function isSupportedController(inspection: string, firmwareBaseline: string): boolean {
  return firmwareBaseline.trim() === '31' && isCc100Fw31Identity(inspection);
}
