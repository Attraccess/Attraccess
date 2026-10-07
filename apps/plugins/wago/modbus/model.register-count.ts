import type { RegisterFormat } from "./model-contracts";

export const registerCount = (format: RegisterFormat): number =>
  ['uint16', 'int16'].includes(format.dataType) ? 1 : 2;
