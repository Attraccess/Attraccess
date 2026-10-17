const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type Stage = {
  rate: number;
  repeat: boolean;
  seconds: number;
  expectedOffers: number;
  generationFailures: number;
  generationTolerance: number;
  achievedCommandsPerSecond: number;
  offered: number;
  acknowledged: number;
  failed: number;
  timeout: number;
  overloadDiscard: number;
  maxPending: number;
  latencyMs: number[];
  passed: boolean;
};

/** Injectable clock/scheduler make host stalls reproducible without a broker. */
export async function runLoadStage(options: {
  rate: number;
  repeat: boolean;
  seconds: number;
  maxPending: number;
  memoryReached: () => boolean;
  command: () => Promise<void>;
  pendingChanged: (pending: number) => void;
  started: (stage: Stage) => void;
  progress: () => Promise<void>;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}): Promise<Stage> {
  const { rate, repeat, seconds } = options;
  const now = options.now ?? Date.now;
  const wait = options.wait ?? delay;
  const stage: Stage = {
    rate,
    repeat,
    seconds: 0,
    expectedOffers: Math.floor(rate * seconds),
    generationFailures: Math.floor(rate * seconds),
    generationTolerance: 0.01,
    achievedCommandsPerSecond: 0,
    offered: 0,
    acknowledged: 0,
    failed: 0,
    timeout: 0,
    overloadDiscard: 0,
    maxPending: 0,
    latencyMs: [],
    passed: false,
  };
  options.started(stage);
  const start = now();
  const inFlight = new Set<Promise<void>>();
  let nextOffer = start;
  let pending = 0;
  while (now() - start < seconds * 1000 && stage.offered < stage.expectedOffers) {
    if (options.memoryReached()) throw new Error('Declared memory budget reached');
    stage.offered++;
    stage.generationFailures = stage.expectedOffers - stage.offered;
    if (pending >= options.maxPending) stage.overloadDiscard++;
    else {
      options.pendingChanged(++pending);
      stage.maxPending = Math.max(stage.maxPending, pending);
      const sentAt = now();
      const operation = options
        .command()
        .then(() => {
          stage.acknowledged++;
          if (stage.latencyMs.length === 4096) stage.latencyMs.shift();
          stage.latencyMs.push(now() - sentAt);
        })
        .catch((error: unknown) => {
          stage.failed++;
          if (/timeout|timed out/i.test(String(error))) stage.timeout++;
        })
        .finally(() => {
          options.pendingChanged(--pending);
          inFlight.delete(operation);
        });
      inFlight.add(operation);
    }
    if (stage.offered % Math.max(1, rate * 5) === 0) await options.progress();
    nextOffer += 1000 / rate;
    await wait(Math.max(1, nextOffer - now()));
  }
  await Promise.all(inFlight);
  stage.seconds = (now() - start) / 1000;
  stage.generationFailures = Math.max(0, stage.expectedOffers - stage.offered);
  stage.achievedCommandsPerSecond = stage.acknowledged / stage.seconds;
  stage.passed =
    stage.generationFailures <= Math.floor(stage.expectedOffers * stage.generationTolerance) &&
    stage.achievedCommandsPerSecond >= rate * (1 - stage.generationTolerance) &&
    stage.failed === 0 &&
    stage.overloadDiscard === 0 &&
    stage.offered === stage.acknowledged;
  return stage;
}
