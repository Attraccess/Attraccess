import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

export interface PassiveValueProps extends BasePartProps {
  readonly resistance?: number | string;
  readonly capacitance?: number | string;
  readonly inductance?: number | string;
}

export interface ResistorWrapperProps extends BasePartProps {
  readonly resistance: number | string;
  readonly tolerance?: number | string;
}

export interface CapacitorWrapperProps extends BasePartProps {
  readonly capacitance: number | string;
  readonly voltage?: number | string;
}

export interface InductorWrapperProps extends BasePartProps {
  readonly inductance: number | string;
}

export const R0402 = ({ name, pn, resistance, tolerance, ...rest }: ResistorWrapperProps) => (
  <resistor
    name={name}
    resistance={resistance}
    {...(tolerance !== undefined ? { tolerance } : {})}
    footprint="0402"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);

export const R0603 = ({ name, pn, resistance, tolerance, ...rest }: ResistorWrapperProps) => (
  <resistor
    name={name}
    resistance={resistance}
    {...(tolerance !== undefined ? { tolerance } : {})}
    footprint="0603"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);

export const C0402 = ({ name, pn, capacitance, ...rest }: CapacitorWrapperProps) => (
  <capacitor
    name={name}
    capacitance={capacitance}
    footprint="0402"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);

export const C0603 = ({ name, pn, capacitance, ...rest }: CapacitorWrapperProps) => (
  <capacitor
    name={name}
    capacitance={capacitance}
    footprint="0603"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);

export const L0603 = ({ name, pn, inductance, ...rest }: InductorWrapperProps) => (
  <inductor
    name={name}
    inductance={inductance}
    footprint="0603"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);
