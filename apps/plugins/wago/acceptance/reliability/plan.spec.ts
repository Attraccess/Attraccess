import {
  FAILURES,
  RECOVERY_LIMIT_MS,
  SHORT_MODE,
  SWEEP_STEPS,
  SWEEP_STEP_MS,
  percentile,
  publishedLimits,
  shortModeFailures,
  stepPasses,
  totalsFromResults,
  type CommandResult,
  type FailureResult,
  type StepResult,
  type Totals,
} from './plan';

const result = (patch: Partial<CommandResult> = {}): CommandResult => ({
  controller: 0,
  commandId: 'c',
  sentAt: 0,
  settledAt: 10,
  outcome: 'acknowledged',
  duringFailure: false,
  ...patch,
});
const clean: Totals = {
  commands: 10,
  acknowledged: 10,
  lost: 0,
  duplicateApplied: 0,
  hostQueueDrops: 0,
  controllerDrops: { oversized: 0, overload: 0 },
  lostState: 0,
};
const recovered = (patch: Partial<FailureResult> = {}): FailureResult => ({
  failure: 'broker-outage',
  injectedAt: 0,
  recoveryMs: 20_000,
  stateMatches: true,
  ...patch,
});
const step = (controllers: number, commandsPerSecond: number, patch: Partial<StepResult> = {}): StepResult => ({
  controllers,
  commandsPerSecond,
  durationMs: SWEEP_STEP_MS,
  totals: clean,
  p95AcknowledgementMs: 50,
  recoveryMs: null,
  ...patch,
});

describe('reliability plan', () => {
  it('injects every required failure in the short mode, once, with four controllers', () => {
    expect(SHORT_MODE.controllers).toBe(4);
    expect(new Set(SHORT_MODE.failures)).toEqual(
      new Set([
        'broker-outage',
        'connection-loss',
        'runtime-restart',
        'server-restart',
        'duplicate-command',
        'out-of-order',
        'oversized-messages',
        'rejected-configuration',
        'credential-rotation',
      ]),
    );
    expect(FAILURES).toHaveLength(new Set(FAILURES).size);
  });

  it('sweeps one to 128 controllers at 1 command/s, then raises the rate, in five-minute steps for about an hour', () => {
    expect(SWEEP_STEPS.slice(0, 8).map((item) => item.controllers)).toEqual([1, 2, 4, 8, 16, 32, 64, 128]);
    expect(SWEEP_STEPS.slice(0, 8).every((item) => item.commandsPerSecond === 1)).toBe(true);
    expect(SWEEP_STEPS.slice(8).every((item) => item.controllers === 128)).toBe(true);
    expect((SWEEP_STEPS.length * SWEEP_STEP_MS) / 60_000).toBe(60);
  });
});

describe('short-mode verdict', () => {
  it('passes a clean run', () => {
    expect(shortModeFailures(clean, [recovered()])).toEqual([]);
  });

  it('counts only healthy-period commands as lost', () => {
    const totals = totalsFromResults(
      [
        result(),
        result({ outcome: 'timeout', duringFailure: true }),
        result({ outcome: 'timeout' }),
        result({ outcome: 'rejected' }),
      ],
      new Map(),
      0,
      {},
      0,
    );
    expect(totals).toMatchObject({ commands: 4, acknowledged: 1, lost: 2 });
  });

  it.each([
    ['a lost command', { lost: 1 }, '1 command(s) lost'],
    ['lost state', { lostState: 2 }, '2 controller state(s) lost'],
    ['a host queue drop', { hostQueueDrops: 1 }, '1 host queue drop(s)'],
    ['a duplicated apply', { duplicateApplied: 1 }, 'applied more than once'],
  ])('fails on %s', (_name, patch, reason) => {
    expect(shortModeFailures({ ...clean, ...patch }, [recovered()]).join()).toContain(reason);
  });

  it('fails when recovery exceeds 180 seconds, or never happens', () => {
    expect(shortModeFailures(clean, [recovered({ recoveryMs: RECOVERY_LIMIT_MS })])).toEqual([]);
    expect(shortModeFailures(clean, [recovered({ recoveryMs: RECOVERY_LIMIT_MS + 1 })])[0]).toContain('recovery took');
    expect(shortModeFailures(clean, [recovered({ recoveryMs: null })])[0]).toContain('never recovered');
  });

  it('does not fail on controller drop counts, which the oversized-message failure produces on purpose', () => {
    expect(shortModeFailures({ ...clean, controllerDrops: { oversized: 4, overload: 0 } }, [recovered()])).toEqual([]);
  });
});

describe('measured limits', () => {
  it('rejects a step with a loss, a drop, a duplicate or slow acknowledgements', () => {
    expect(stepPasses(step(4, 1))).toBe(true);
    expect(stepPasses(step(4, 1, { totals: { ...clean, lost: 1 } }))).toBe(false);
    expect(stepPasses(step(4, 1, { totals: { ...clean, hostQueueDrops: 1 } }))).toBe(false);
    expect(stepPasses(step(4, 1, { totals: { ...clean, controllerDrops: { overload: 1 } } }))).toBe(false);
    expect(stepPasses(step(4, 1, { totals: { ...clean, duplicateApplied: 1 } }))).toBe(false);
    expect(stepPasses(step(4, 1, { p95AcknowledgementMs: 2_001 }))).toBe(false);
    expect(stepPasses(step(4, 1, { p95AcknowledgementMs: null }))).toBe(false);
  });

  it('publishes half the highest passing step and twice the slowest recovery', () => {
    const failing = { totals: { ...clean, lost: 3 } };
    const limits = publishedLimits(
      [step(1, 1), step(2, 1), step(4, 1), step(8, 1), step(16, 1, failing), step(32, 1, failing)],
      [10_000, 45_000, null, 30_000],
    );
    expect(limits.highestPassing).toEqual({ controllers: 8, commandsPerSecond: 1 });
    expect(limits.limit).toEqual({ controllers: 4, commandsPerSecond: 1, totalCommandsPerSecond: 4 });
    expect(limits.recoveryTargetMs).toBe(90_000);
    expect(limits.singleControllerDefect).toBe(false);
  });

  it('ranks steps by total command rate, not by controller count', () => {
    const limits = publishedLimits([step(128, 1), step(128, 2), step(128, 4, { p95AcknowledgementMs: 9_000 })], []);
    expect(limits.highestPassing).toEqual({ controllers: 128, commandsPerSecond: 2 });
    expect(limits.limit?.controllers).toBe(64);
    expect(limits.recoveryTargetMs).toBeNull();
  });

  it('flags a failing single-controller step as a product defect and publishes no limit', () => {
    const limits = publishedLimits([step(1, 1, { totals: { ...clean, lost: 1 } })], []);
    expect(limits.singleControllerDefect).toBe(true);
    expect(limits.limit).toBeNull();
  });

  it('computes percentiles of acknowledgement latency', () => {
    expect(percentile([], 0.95)).toBeNull();
    expect(percentile([5, 1, 3, 2, 4], 0.95)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBe(5);
  });
});
