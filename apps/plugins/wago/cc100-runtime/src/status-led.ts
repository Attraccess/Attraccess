import { writeFileSync } from 'node:fs';

/** Mirrors runtime health on the CC100 RUN LED (green + red dies; both = yellow).
 * Purely cosmetic: missing mounts or permission errors disable it, never the runtime.
 */
export type RunLedState = 'starting' | 'pairing' | 'disconnected' | 'unconfigured' | 'fault' | 'ready';
type Color = 'off' | 'green' | 'red' | 'yellow';
type Frame = readonly [Color, number];

export const RUN_LED_PATHS = {
  green: '/run/attraccess-wago/io/led-run-green',
  red: '/run/attraccess-wago/io/led-run-red',
} as const;

const blink = (color: Color, ms: number): Frame[] => [
  [color, ms],
  ['off', ms],
];
const heartbeat: Frame[] = [
  ['green', 70],
  ['off', 110],
  ['green', 70],
  ['off', 950],
];
// Every ~40s a healthy controller does a little traffic-light dance.
const fanfare: Frame[] = [
  ...[1, 2, 3].flatMap((): Frame[] => [
    ['green', 90],
    ['yellow', 90],
    ['red', 90],
    ['yellow', 90],
  ]),
  ['green', 400],
  ...blink('green', 60),
  ...blink('green', 60),
  ['off', 600],
];

export const RUN_LED_PATTERNS: Record<RunLedState, readonly Frame[]> = {
  starting: [['yellow', 1000]],
  pairing: blink('yellow', 500),
  disconnected: blink('red', 500),
  unconfigured: [
    ['green', 500],
    ['yellow', 500],
  ],
  fault: [
    ['red', 1400],
    ['off', 200],
  ],
  ready: [...Array.from({ length: 35 }, () => heartbeat).flat(), ...fanfare],
};

export class RunLed {
  private state?: RunLedState;
  private frame = 0;
  private timer?: NodeJS.Timeout;
  private lit = { green: -1, red: -1 };
  private disabled = false;

  constructor(
    private readonly write: (led: 'green' | 'red', value: 0 | 1) => void = (led, value) =>
      writeFileSync(RUN_LED_PATHS[led], String(value)),
  ) {}

  set(state: RunLedState): void {
    if (this.disabled || state === this.state) return;
    this.state = state;
    this.frame = 0;
    clearTimeout(this.timer);
    this.tick();
  }

  /** Final: later set() calls (e.g. MQTT close during shutdown) must not relight the LED. */
  stop(): void {
    clearTimeout(this.timer);
    this.state = undefined;
    this.show('off');
    this.disabled = true;
  }

  private tick(): void {
    if (!this.state) return;
    const pattern = RUN_LED_PATTERNS[this.state];
    const [color, ms] = pattern[this.frame++ % pattern.length];
    this.show(color);
    if (!this.disabled && pattern.length > 1) this.timer = setTimeout(() => this.tick(), ms).unref();
  }

  private show(color: Color): void {
    const next = { green: +(color === 'green' || color === 'yellow'), red: +(color === 'red' || color === 'yellow') };
    try {
      for (const led of ['green', 'red'] as const) {
        if (this.lit[led] === next[led]) continue;
        this.write(led, next[led] as 0 | 1);
        this.lit[led] = next[led];
      }
    } catch (error) {
      if (this.disabled) return;
      this.disabled = true;
      clearTimeout(this.timer);
      process.stderr.write(
        `WAGO CC100 RUN LED disabled (${error instanceof Error ? error.message : String(error)}); I/O is unaffected\n`,
      );
    }
  }
}
