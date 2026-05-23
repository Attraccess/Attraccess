export type JlcPartNumber = string;

export interface JlcSupplierEntry {
  jlcpcb: string[];
}

export function jlcSupplier(pn: JlcPartNumber): JlcSupplierEntry {
  return { jlcpcb: [pn] };
}

export interface BasePartProps {
  readonly name: string;
  readonly pn: JlcPartNumber;
  readonly pcbX?: number | string;
  readonly pcbY?: number | string;
  readonly pcbRotation?: number | string;
  readonly layer?: 'top' | 'bottom';
}
