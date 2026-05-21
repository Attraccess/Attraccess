// Placeholder one-LED tscircuit board used to smoke-test the hardware toolchain
// FEATURE: hardware/_placeholder — toolchain validation board, removed once Beeper lands

export default () => (
  <board width="15mm" height="15mm" routingDisabled>
    <resistor name="R1" resistance="1k" footprint="0603" pcbX={-3} pcbY={0} />
    <led name="LED1" footprint="0603" pcbX={3} pcbY={0} />
    <trace from=".R1 > .pin2" to=".LED1 > .pin1" />
  </board>
);
