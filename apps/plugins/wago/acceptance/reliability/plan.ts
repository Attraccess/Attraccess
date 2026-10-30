/**
 * Scenario plans, pass criteria and published-limit arithmetic of the reliability harness.
 * Pure on purpose: the numbers that end up in documentation are computed here and unit tested.
 */
export const FAILURES = [
  'broker-outage',
  'connection-loss',
  'runtime-restart',
  'server-restart',
  'duplicate-command',
  'out-of-order',
  'oversized-messages',
  'rejected-configuration',
  'credential-rotation',
] as const;
export type Failure = (typeof FAILURES)[number];

/** Recovery beyond this fails the short mode. */
export const RECOVERY_LIMIT_MS = 180_000;
export const BROKER_OUTAGE_MS = 30_000;

export type Mode = 'short' | 'sweep';

export const SHORT_MODE = {
  controllers: 4,
  commandsPerSecond: 1,
  failures: FAILURES,
  /** Healthy traffic before the first failure and after each recovery. */
  settleMs: 8_000,
} as const;

/** Sweep: controllers 1 to 128 at 1 command/s, then the per-controller rate rises. Five minutes per step. */
export const SWEEP_STEP_MS = 5 * 60_000;
export const SWEEP_STEPS: ReadonlyArray<{ controllers: number; commandsPerSecond: number }> = [
  ...[1, 2, 4, 8, 16, 32, 64, 128].map((controllers) => ({ controllers, commandsPerSecond: 1 })),
  ...[2, 4, 8, 16].map((commandsPerSecond) => ({ controllers: 128, commandsPerSecond })),
];

export type CommandOutcome = 'acknowledged' | 'rejected' | 'timeout' | 'dispatch-failed';

export type CommandResult = {
  controller: number;
  commandId: string;
  sentAt: number;
  settledAt: number;
  outcome: CommandOutcome;
  /** Sent while an injected failure was active or recovering; such commands may fail without being lost. */
  duringFailure: boolean;
};

export type FailureResult = {
  failure: Failure;
  injectedAt: number;
  recoveryMs: number | null;
  stateMatches: boolean;
  detail?: string;
};

export type Totals = {
  commands: number;
  acknowledged: number;
  /** Healthy-period commands that were never acknowledged. */
  lost: number;
  /** Commands the controller accepted more than once. */
  duplicateApplied: number;
  hostQueueDrops: number;
  controllerDrops: Record<string, number>;
  lostState: number;
};

export function totalsFromResults(
  results: CommandResult[],
  accepted: Map<string, number>,
  hostQueueDrops: number,
  controllerDrops: Record<string, number>,
  lostState: number,
): Totals {
  return {
    commands: results.length,
    acknowledged: results.filter((result) => result.outcome === 'acknowledged').length,
    lost: results.filter((result) => !result.duringFailure && result.outcome !== 'acknowledged').length,
    duplicateApplied: [...accepted.values()].filter((count) => count > 1).length,
    hostQueueDrops,
    controllerDrops,
    lostState,
  };
}

/** The short mode fails only on these four conditions, plus a duplicated apply, which is never acceptable. */
export function shortModeFailures(totals: Totals, failures: FailureResult[]): string[] {
  const reasons: string[] = [];
  if (totals.lost) reasons.push(`${totals.lost} command(s) lost`);
  if (totals.duplicateApplied) reasons.push(`${totals.duplicateApplied} command(s) applied more than once`);
  if (totals.lostState) reasons.push(`${totals.lostState} controller state(s) lost`);
  if (totals.hostQueueDrops) reasons.push(`${totals.hostQueueDrops} host queue drop(s)`);
  for (const result of failures) {
    if (result.recoveryMs === null) reasons.push(`${result.failure}: never recovered`);
    else if (result.recoveryMs > RECOVERY_LIMIT_MS)
      reasons.push(`${result.failure}: recovery took ${Math.round(result.recoveryMs / 1000)} s`);
    if (!result.stateMatches) reasons.push(`${result.failure}: state differs after recovery`);
  }
  return reasons;
}

export type StepResult = {
  controllers: number;
  commandsPerSecond: number;
  durationMs: number;
  totals: Totals;
  p95AcknowledgementMs: number | null;
  recoveryMs: number | null;
};

/** A sweep step passes when nothing was lost, dropped or duplicated and acknowledgements stayed prompt. */
export function stepPasses(step: StepResult, acknowledgementBudgetMs = 2_000): boolean {
  const controllerDrops = Object.values(step.totals.controllerDrops).reduce((sum, value) => sum + value, 0);
  return (
    step.totals.commands > 0 &&
    step.totals.lost === 0 &&
    step.totals.duplicateApplied === 0 &&
    step.totals.hostQueueDrops === 0 &&
    controllerDrops === 0 &&
    step.p95AcknowledgementMs !== null &&
    step.p95AcknowledgementMs <= acknowledgementBudgetMs
  );
}

/** Published limits are half the highest passing step; recovery targets are twice the slowest recovery. */
export function publishedLimits(steps: StepResult[], recoveries: Array<number | null>) {
  const passing = steps.filter((step) => stepPasses(step));
  const best = passing.reduce<StepResult | undefined>(
    (highest, step) =>
      !highest || step.controllers * step.commandsPerSecond > highest.controllers * highest.commandsPerSecond
        ? step
        : highest,
    undefined,
  );
  const measured = recoveries.filter((value): value is number => value !== null);
  return {
    highestPassing: best ? { controllers: best.controllers, commandsPerSecond: best.commandsPerSecond } : null,
    limit: best
      ? {
          controllers: Math.max(1, Math.floor(best.controllers / 2)),
          commandsPerSecond: best.commandsPerSecond,
          totalCommandsPerSecond: (best.controllers * best.commandsPerSecond) / 2,
        }
      : null,
    recoveryTargetMs: measured.length ? Math.max(...measured) * 2 : null,
    /** A failure at the first, single-controller step is a defect in the product, not a limit. */
    singleControllerDefect: steps.some((step) => step.controllers === 1 && !stepPasses(step)),
  };
}

export function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}
