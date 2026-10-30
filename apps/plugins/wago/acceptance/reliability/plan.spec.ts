import {
  FAILURES,
  RECOVERY_LIMIT_MS,
  SHORT_MODE,
  SWEEP_STEPS,
  SWEEP_STEP_MS,
  acceptableValues,
  harnessErrors,
  percentile,
  publishedLimits,
  shortModeFailures,
  shortModeNotes,
  stepPasses,
  totalsFromResults,
  type CommandResult,
  type FailureResult,
  type StepResult,
  type Totals,
} from './plan';

const result = (patch: Partial<CommandResult> = {}): CommandResult => ({
  controller: 0,
  channelId: 'out-a',
  value: true,
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
  healthyRejected: 0,
  healthyDispatchFailed: 0,
  duplicateApplied: 0,
  hostQueueOverflows: 0,
  controllerDrops: { oversized: 0, overload: 0 },
  lostState: 0,
};
const recovered = (patch: Partial<FailureResult> = {}): FailureResult => ({
  failure: 'broker-outage',
  injectedAt: 0,
  recoveryMs: 20_000,
  stateMatches: true,
  injectionVerified: true,
  ...patch,
});
const step = (controllers: number, commandsPerSecond: number, patch: Partial<StepResult> = {}): StepResult => ({
  controllers,
  commandsPerSecond,
  durationMs: SWEEP_STEP_MS,
  totals: clean,
  p95AcknowledgementMs: 50,
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

  it('counts as lost only healthy-period commands that never got an answer', () => {
    const totals = totalsFromResults(
      [
        result(),
        result({ outcome: 'timeout', duringFailure: true }),
        result({ outcome: 'dispatch-failed', duringFailure: true }),
        result({ outcome: 'timeout' }),
        result({ outcome: 'rejected' }),
        result({ outcome: 'dispatch-failed' }),
      ],
      new Map([
        ['once', 1],
        ['twice', 2],
      ]),
      0,
      {},
      0,
    );
    expect(totals).toMatchObject({
      commands: 6,
      acknowledged: 1,
      lost: 1,
      healthyRejected: 1,
      healthyDispatchFailed: 1,
      duplicateApplied: 1,
    });
  });

  it.each([
    ['a lost command', { lost: 1 }, '1 command(s) lost'],
    ['lost state', { lostState: 2 }, '2 controller state(s) lost'],
    ['a host queue drop', { hostQueueOverflows: 1 }, '1 host queue overflow(s)'],
  ])('fails on %s', (_name, patch, reason) => {
    expect(shortModeFailures({ ...clean, ...patch }, [recovered()]).join()).toContain(reason);
  });

  it('fails when a failure leaves the controller state differing after recovery', () => {
    const reasons = shortModeFailures(clean, [recovered({ stateMatches: false, stateDetail: 'controller 1 out-a' })]);
    expect(reasons).toEqual(['broker-outage: state lost after recovery (controller 1 out-a)']);
  });

  it.each([
    ['a duplicated apply', { duplicateApplied: 1 }, [recovered()], 'applied more than once'],
    ['a healthy rejection', { healthyRejected: 1 }, [recovered()], 'rejected'],
    ['a healthy dispatch failure', { healthyDispatchFailed: 1 }, [recovered()], 'could not be published'],
    [
      'a failed injection check',
      {},
      [recovered({ failure: 'credential-rotation', injectionVerified: false, detail: 'rotation failed' })],
      'credential-rotation: injection check failed (rotation failed)',
    ],
  ])('reports %s without failing the gate', (_name, patch, failures, note) => {
    expect(shortModeFailures({ ...clean, ...patch }, failures)).toEqual([]);
    expect(shortModeNotes({ ...clean, ...patch }, failures).join()).toContain(note);
  });

  it('reports a failure the harness could not inject separately from the product verdict', () => {
    const failures = [
      recovered({ failure: 'runtime-restart', harnessError: 'harness could not inject runtime-restart: farm gone' }),
    ];
    expect(shortModeFailures(clean, failures)).toEqual([]);
    expect(harnessErrors(failures)).toEqual(['harness could not inject runtime-restart: farm gone']);
    expect(harnessErrors([recovered()])).toEqual([]);
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

describe('expected controller state', () => {
  const at = (sentAt: number, value: boolean, outcome: CommandResult['outcome']) => result({ sentAt, value, outcome });

  it('expects the value of the last acknowledged command', () => {
    expect(acceptableValues([at(2, false, 'acknowledged'), at(1, true, 'acknowledged')])).toEqual(new Set([false]));
  });

  it('ignores later rejected commands, which were not applied', () => {
    expect(acceptableValues([at(1, true, 'acknowledged'), at(2, false, 'rejected')])).toEqual(new Set([true]));
  });

  it('accepts either value when a later command has an unknown outcome', () => {
    expect(acceptableValues([at(1, true, 'acknowledged'), at(2, false, 'timeout')])).toEqual(new Set([true, false]));
    expect(acceptableValues([at(1, true, 'acknowledged'), at(2, false, 'dispatch-failed')])).toEqual(
      new Set([true, false]),
    );
  });

  it('accepts any value when no command is known to have been applied', () => {
    expect(acceptableValues([])).toBeNull();
    expect(acceptableValues([at(1, true, 'timeout'), at(2, false, 'rejected')])).toBeNull();
  });
});

describe('measured limits', () => {
  it('rejects a step with a loss, a rejection, a dispatch failure, a drop, a duplicate or slow acknowledgements', () => {
    expect(stepPasses(step(4, 1))).toBe(true);
    expect(stepPasses(step(4, 1, { totals: { ...clean, lost: 1 } }))).toBe(false);
    expect(stepPasses(step(4, 1, { totals: { ...clean, healthyRejected: 1 } }))).toBe(false);
    expect(stepPasses(step(4, 1, { totals: { ...clean, healthyDispatchFailed: 1 } }))).toBe(false);
    expect(stepPasses(step(4, 1, { totals: { ...clean, hostQueueOverflows: 1 } }))).toBe(false);
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
