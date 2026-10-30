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

/** Shared by the host seed and the controller farm: every simulated controller is claimed with this epoch. */
export const CREDENTIAL_EPOCH = '6b6b0b0e-3d0c-4d2a-9b7b-5f0f0b0b0b0b';
export const hardwareId = (index: number) => `rel-${index}`;

export const SHORT_MODE = {
  controllers: 4,
  commandsPerSecond: 1,
  failures: FAILURES,
  /** Healthy traffic before the first failure and after each recovery (5 commands per controller). */
  settleMs: 5_000,
} as const;

/** Sweep: controllers 1 to 128 at 1 command/s, then the per-controller rate rises. Five minutes per step. */
export const SWEEP_STEP_MS = 5 * 60_000;
export const SWEEP_STEPS: ReadonlyArray<{ controllers: number; commandsPerSecond: number }> = [
  ...[1, 2, 4, 8, 16, 32, 64, 128].map((controllers) => ({ controllers, commandsPerSecond: 1 })),
  ...[2, 4, 8, 16].map((commandsPerSecond) => ({ controllers: 128, commandsPerSecond })),
];

/**
 * How the host's command call ended. `acknowledged` and `rejected` are answers from the controller.
 * `timeout` means no answer arrived within the acknowledgement timeout (including a publication that stalled that
 * long). `dispatch-failed` means the host told the caller synchronously that it could not publish the command.
 */
export type CommandOutcome = 'acknowledged' | 'rejected' | 'timeout' | 'dispatch-failed';

export type CommandResult = {
  controller: number;
  channelId: string;
  value: boolean;
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
  /**
   * After recovery, every output the controller holds equals the host's view of it and the last acknowledged command
   * for that channel (or one of the later commands whose outcome is unknown). Gating: false counts as lost state.
   */
  stateMatches: boolean;
  stateDetail?: string;
  /**
   * The failure-specific check (rotation completed, oversized drop counted, rejection reported, ...).
   * Reported only, never gating. Null when the failure has no such check.
   */
  injectionVerified: boolean | null;
  detail?: string;
  /** The harness could not inject the failure at all; the run is invalid, not a product verdict. */
  harnessError?: string;
};

export type Totals = {
  commands: number;
  acknowledged: number;
  /** Healthy-period commands that never got an answer (outcome `timeout`). Gating. */
  lost: number;
  /** Healthy-period commands the controller answered with a rejection. Reported only. */
  healthyRejected: number;
  /** Healthy-period commands the host reported it could not publish. Reported only. */
  healthyDispatchFailed: number;
  /** Commands the controller accepted more than once. Reported only in the short mode. */
  duplicateApplied: number;
  /**
   * Host plugin queue overflow episodes: the host logs once per burst of drops, so this is a lower bound on
   * dropped messages and is non-zero whenever any message was dropped. Gating.
   */
  hostQueueOverflows: number;
  controllerDrops: Record<string, number>;
  lostState: number;
};

export function totalsFromResults(
  results: CommandResult[],
  accepted: Map<string, number>,
  hostQueueOverflows: number,
  controllerDrops: Record<string, number>,
  lostState: number,
): Totals {
  const healthy = (outcome: CommandOutcome) =>
    results.filter((result) => !result.duringFailure && result.outcome === outcome).length;
  return {
    commands: results.length,
    acknowledged: results.filter((result) => result.outcome === 'acknowledged').length,
    lost: healthy('timeout'),
    healthyRejected: healthy('rejected'),
    healthyDispatchFailed: healthy('dispatch-failed'),
    duplicateApplied: [...accepted.values()].filter((count) => count > 1).length,
    hostQueueOverflows,
    controllerDrops,
    lostState,
  };
}

/**
 * Values a channel may hold after its commands settled: the value of the last acknowledged command, plus the value
 * of every later command whose outcome is unknown (timeout or dispatch failure). Rejected commands were not applied.
 * Null when no command to the channel is known to have been applied, so any value is acceptable.
 */
export function acceptableValues(commands: CommandResult[]): Set<boolean> | null {
  const acceptable = new Set<boolean>();
  const ordered = [...commands].sort((a, b) => a.sentAt - b.sentAt);
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const command = ordered[index];
    if (command.outcome === 'rejected') continue;
    acceptable.add(command.value);
    if (command.outcome === 'acknowledged') return acceptable;
  }
  return null;
}

/**
 * The short mode (CI gate) fails only on a lost command, lost state, a host queue drop, or a recovery over 180 s.
 * Duplicates, injection checks and healthy rejections or dispatch failures are reported by `shortModeNotes`.
 */
export function shortModeFailures(totals: Totals, failures: FailureResult[]): string[] {
  const reasons: string[] = [];
  if (totals.lost) reasons.push(`${totals.lost} command(s) lost`);
  if (totals.lostState) reasons.push(`${totals.lostState} controller state(s) lost`);
  if (totals.hostQueueOverflows) reasons.push(`${totals.hostQueueOverflows} host queue overflow(s)`);
  for (const result of failures) {
    if (result.recoveryMs === null) reasons.push(`${result.failure}: never recovered`);
    else if (result.recoveryMs > RECOVERY_LIMIT_MS)
      reasons.push(`${result.failure}: recovery took ${Math.round(result.recoveryMs / 1000)} s`);
    if (!result.stateMatches) reasons.push(`${result.failure}: state lost after recovery (${result.stateDetail})`);
  }
  return reasons;
}

/** Failures the harness could not inject. Any entry invalidates the run; it is not a product verdict. */
export function harnessErrors(failures: FailureResult[]): string[] {
  return failures.flatMap((result) => (result.harnessError ? [result.harnessError] : []));
}

/** Non-gating observations, printed with the summary so they are not mistaken for the verdict. */
export function shortModeNotes(totals: Totals, failures: FailureResult[]): string[] {
  const notes: string[] = [];
  if (totals.duplicateApplied) notes.push(`${totals.duplicateApplied} command(s) applied more than once`);
  if (totals.healthyRejected) notes.push(`${totals.healthyRejected} healthy-period command(s) rejected`);
  if (totals.healthyDispatchFailed)
    notes.push(`${totals.healthyDispatchFailed} healthy-period command(s) could not be published`);
  for (const result of failures)
    if (result.injectionVerified === false) notes.push(`${result.failure}: injection check failed (${result.detail})`);
  return notes;
}

export type StepResult = {
  controllers: number;
  commandsPerSecond: number;
  durationMs: number;
  totals: Totals;
  p95AcknowledgementMs: number | null;
};

/**
 * A sweep step passes when nothing was lost, rejected, unpublished, dropped or duplicated and acknowledgements stayed
 * prompt. A sweep injects no failure, so every command is a healthy-period command.
 */
export function stepPasses(step: StepResult, acknowledgementBudgetMs = 2_000): boolean {
  const controllerDrops = Object.values(step.totals.controllerDrops).reduce((sum, value) => sum + value, 0);
  return (
    step.totals.commands > 0 &&
    step.totals.lost === 0 &&
    step.totals.healthyRejected === 0 &&
    step.totals.healthyDispatchFailed === 0 &&
    step.totals.duplicateApplied === 0 &&
    step.totals.hostQueueOverflows === 0 &&
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
