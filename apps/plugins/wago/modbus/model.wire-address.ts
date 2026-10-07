import type { RegisterFormat } from "./model-contracts";
import { registerCount } from "./model.register-count";

export function wireAddress(format: RegisterFormat): number {
  if (!Number.isSafeInteger(format.address) || ![0, 1].includes(format.addressBase))
    throw new Error('invalid Modbus register address');
  const address = format.address - format.addressBase;
  if (address < 0 || address + registerCount(format) > 65536) throw new Error('invalid Modbus register address');
  return address;
}
