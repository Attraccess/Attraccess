export type PinDirection = 'in' | 'out' | 'bidir' | 'power' | 'gnd';

export interface PinDef<Signal extends string = string> {
  readonly signal: Signal;
  readonly direction: PinDirection;
  readonly voltage?: string;
  readonly notes?: string;
}

export interface ConnectorSpec<Signal extends string = string> {
  readonly name: string;
  readonly footprint: string;
  readonly pitch: string;
  readonly pinCount: number;
  readonly pins: Readonly<Record<number, PinDef<Signal>>>;
  readonly requiredSignals: readonly Signal[];
  readonly expectedPowerPins: number;
  readonly expectedGndPins: number;
}

export type SignalOf<C extends ConnectorSpec> = C['requiredSignals'][number];

export type RequiredWires<C extends ConnectorSpec> = {
  readonly [K in SignalOf<C>]: unknown;
};

export function assertWiresAllSignals<C extends ConnectorSpec>(
  connector: C,
  wires: RequiredWires<C>,
): RequiredWires<C> {
  const missing = connector.requiredSignals.filter((s) => !(s in wires));
  if (missing.length > 0) {
    throw new Error(
      `Connector ${connector.name} missing required signals: ${missing.join(', ')}`,
    );
  }
  return wires;
}

export function pinsBySignal<C extends ConnectorSpec>(
  connector: C,
): Readonly<Record<SignalOf<C>, number[]>> {
  const out: Record<string, number[]> = {};
  for (const [pinStr, def] of Object.entries(connector.pins)) {
    const sig = def.signal;
    if (!out[sig]) out[sig] = [];
    out[sig].push(Number.parseInt(pinStr, 10));
  }
  return out as Readonly<Record<SignalOf<C>, number[]>>;
}

export function countPinsByDirection(connector: ConnectorSpec, direction: PinDirection): number {
  return Object.values(connector.pins).filter((p) => p.direction === direction).length;
}
